import "server-only";
import { createHash } from "node:crypto";
import { emptyAccount, post, balances, validateJournal } from "../engine.mjs";
import { id, add, canonical, validateRecord } from "../schemas.mjs";

const check = (ok, reason) => { if (!ok) throw Error(reason); };
const hash = value => createHash("sha256").update(canonical(value)).digest("hex");
const fields = {
  receive: ["lotId", "purpose", "paymentEvidenceId", "requestId"],
  redeem: ["lotId", "projectId", "appointmentId", "amountCents", "purpose", "creditType"],
  reserve_refund: ["lotId", "caseId", "amountCents"], release_refund: ["lotId", "caseId"],
  freeze_dispute: ["lotId", "caseId"], release_dispute: ["lotId", "caseId"],
  complete_refund: ["lotId", "caseId", "amountCents", "refundEvidenceId"],
  cancel_membership: ["membershipId"], reverse: ["originalId"],
};
export function accountKey(scope) {
  check(scope && id(scope.clientId) && ["sandbox", "production"].includes(scope.environment)
    && Object.keys(scope).length === 2, "invalid_scope");
  return hash([scope.environment, scope.clientId]);
}
export function ledgerPaths(scope) {
  const account = `financialLedgerAccounts/${accountKey(scope)}`;
  return { account, journal: `${account}/journal`, lots: `${account}/lots`, allocations: `${account}/allocations`,
    reversals: `${account}/reversals`, operations: `${account}/operations` };
}
export const policyPath = (environment, policyId, version) => {
  check(["sandbox", "production"].includes(environment) && id(policyId)
    && Number.isSafeInteger(version) && version > 0, "invalid_policy_reference");
  return `financialLedgerPolicies/${hash([environment, policyId, version])}`;
};
export const evidencePath = (scope, kind, evidenceId) => {
  check(["payments", "requests", "refunds"].includes(kind) && id(evidenceId), "invalid_evidence_reference");
  return `financialLedgerEvidence/${accountKey(scope)}/${kind}/${evidenceId}`;
};
export const sourcePath = sourceKey => `financialLedgerSources/${hash(sourceKey)}`;

function emptyProjection(scope) {
  const state = emptyAccount(scope);
  return { schemaVersion: 1, ...scope, currency: "CAD", revision: 0, balances: state.balances,
    summary: balances(state) };
}
function validateProjection(projection, scope) {
  check(projection.schemaVersion === 1 && projection.clientId === scope.clientId
    && projection.environment === scope.environment && projection.currency === "CAD"
    && Number.isSafeInteger(projection.revision) && projection.revision >= 0, "invalid_projection");
  const baseline = emptyProjection(scope);
  for (const name of ["balances", "summary"]) {
    check(canonical(Object.keys(projection[name]).sort()) === canonical(Object.keys(baseline[name]).sort()), "invalid_projection");
    check(Object.values(projection[name]).every(Number.isSafeInteger), "invalid_projection");
  }
  check(Object.values(projection.balances).reduce(add, 0) === 0, "unbalanced_projection");
  check(Object.values(projection.summary).every(value => value >= 0)
    && projection.summary.prepaidLiabilityCents === -projection.balances.purchasedLiability
    && add(projection.summary.availablePurchasedCents, projection.summary.reservedPurchasedCents)
      === projection.summary.prepaidLiabilityCents, "projection_drift");
}
// A lot-local engine state keeps Stage 2A's validation and journal semantics,
// without loading unrelated lots or historical entries. Aggregate deltas are
// applied under the shared account revision in the same Firestore transaction.
function localState(scope, projection, lot, original) {
  const state = emptyAccount(scope);
  state.revision = projection.revision;
  if (lot) {
    state.lots[lot.id] = lot;
    const remaining = add(lot.fundedCents, -add(lot.usedCents, lot.refundedCents));
    state.balances[lot.type === "purchased" ? "purchasedLiability" : "promotionalLiability"] = -remaining;
    state.balances.squareClearing = remaining;
  }
  if (original) state.entries.push(original);
  return state;
}

/** Inert server library. Callers MUST supply an authenticated server authorizer.
 * No application route imports this adapter. No SDK initialization or credentials
 * are read here. Database/evidence writers are privileged dependencies.
 */
export function createFirestoreLedger({ db, authorize, clock = () => new Date().toISOString() }) {
  check(db && typeof db.runTransaction === "function" && typeof authorize === "function", "server_dependencies_required");
  return {
    async post(scope, input, principal) {
      const paths = ledgerPaths(scope);
      const commandFields = fields[input?.type];
      check(commandFields && id(input.id) && Object.keys(input).length === commandFields.length + 5
        && ["id", "type", "policyId", "policyVersion", "expectedRevision", ...commandFields].every(k => Object.hasOwn(input, k)), "invalid_operation");
      check(input.expectedRevision === null || (Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0), "invalid_revision");
      for (const key of ["lotId", "originalId", "paymentEvidenceId", "refundEvidenceId", "requestId", "caseId", "membershipId", "appointmentId"]) {
        if (Object.hasOwn(input, key)) check(id(input[key]), "invalid_identifier");
      }
      const policyRef = db.doc(policyPath(scope.environment, input.policyId, input.policyVersion));
      // Runs once before retries. This MUST verify session/service identity and
      // action/client/project access, not trust actor IDs/roles in request JSON.
      const actor = await authorize(principal, { ...scope, operation: structuredClone(input) });
      check(actor && id(actor.actorId) && id(actor.authorizationEvidenceId), "authorization_required");
      const recordedAt = clock();
      check(typeof recordedAt === "string" && new Date(recordedAt).toISOString() === recordedAt, "invalid_server_time");
      const intent = hash({ scope, input: { ...input, expectedRevision: null }, actorId: actor.actorId });
      const operationRef = db.doc(`${paths.operations}/${input.id}`);
      return db.runTransaction(async tx => {
        const [operationSnap, accountSnap, policySnap] = await tx.getAll(operationRef, db.doc(paths.account), policyRef);
        if (operationSnap.exists) {
          const operation = operationSnap.data();
          check(operation.intent === intent, "posting_id_collision");
          const entry = (await tx.get(db.doc(`${paths.journal}/${input.id}`))).data();
          validateJournal(entry);
          check(entry.clientId === scope.clientId && entry.environment === scope.environment, "journal_scope_mismatch");
          return { entry, duplicate: true };
        }
        check(policySnap.exists, "missing_policy");
        const policy = validateRecord("policy", policySnap.data());
        check(policy.id === input.policyId && policy.version === input.policyVersion && policy.status === "approved", "policy_not_approved");
        const projection = accountSnap.exists ? accountSnap.data() : emptyProjection(scope);
        validateProjection(projection, scope);
        check(input.expectedRevision === null || input.expectedRevision === projection.revision, "stale_revision");
        let original = null, reversalRef = null;
        if (input.type === "reverse") {
          original = (await tx.get(db.doc(`${paths.journal}/${input.originalId}`))).data();
          validateJournal(original);
          check(original.clientId === scope.clientId && original.environment === scope.environment
            && original.command.type !== "reverse", "invalid_reversal");
          reversalRef = db.doc(`${paths.reversals}/${input.originalId}`);
          check(!(await tx.get(reversalRef)).exists, "already_reversed");
        }
        const originalLots = original ? Object.keys(original.lotChanges) : [];
        check(originalLots.length <= 1, "unsupported_multi_lot_reversal");
        const lotId = input.lotId || originalLots[0];
        if (lotId) check(id(lotId), "invalid_identifier");
        const lotRef = lotId ? db.doc(`${paths.lots}/${lotId}`) : null;
        const lot = lotRef ? (await tx.get(lotRef)).data() || null : null;
        if (lot) check(lot.id === lotId && Object.keys(lot.refundHolds).length <= 128
          && lot.disputes.length <= 128, "invalid_or_oversized_lot");
        const command = { ...input, actorId: actor.actorId, recordedAt };
        for (const key of ["policyId", "policyVersion", "expectedRevision"]) delete command[key];
        if (input.type === "receive") {
          const [paymentSnap, requestSnap] = await tx.getAll(
            db.doc(evidencePath(scope, "payments", input.paymentEvidenceId)),
            db.doc(evidencePath(scope, "requests", input.requestId)));
          command.payment = validateRecord("providerTransaction", paymentSnap.data());
          command.request = validateRecord("paymentRequest", requestSnap.data());
          check(command.payment.evidenceId === input.paymentEvidenceId && command.request.id === input.requestId, "evidence_reference_mismatch");
          delete command.paymentEvidenceId; delete command.requestId;
        }
        if (input.type === "complete_refund") {
          command.verifiedRefund = validateRecord("providerRefund", (await tx.get(db.doc(evidencePath(scope, "refunds", input.refundEvidenceId)))).data());
          check(command.verifiedRefund.evidenceId === input.refundEvidenceId, "evidence_reference_mismatch");
          delete command.refundEvidenceId;
        }
        const before = localState(scope, projection, lot, original);
        const result = post(before, command, policy);
        check(!result.duplicate, "unexpected_duplicate");
        const entry = result.entry;
        check(Buffer.byteLength(canonical(entry)) <= 262144, "journal_size_limit");
        for (const change of Object.values(entry.lotChanges)) {
          if (change.after) check(Object.keys(change.after.refundHolds).length <= 128
            && change.after.disputes.length <= 128, "lot_case_limit");
        }
        const sourceRef = entry.sourceKey ? db.doc(sourcePath(entry.sourceKey)) : null;
        if (sourceRef) check(!(await tx.get(sourceRef)).exists, "duplicate_provider_source");
        const policyGuard = db.doc(`financialLedgerPolicyGuards/${hash([scope.environment, policy.id, policy.version])}`);
        const guard = await tx.get(policyGuard);
        if (guard.exists) check(guard.data().hash === hash(policy), "policy_version_collision");
        const next = structuredClone(projection);
        next.revision = entry.sequence;
        for (const line of entry.lines) next.balances[line.account] = add(next.balances[line.account], add(line.debitCents, -line.creditCents));
        const beforeSummary = balances(before), afterSummary = balances(result.state);
        for (const key of Object.keys(next.summary)) next.summary[key] = add(next.summary[key], add(afterSummary[key], -beforeSummary[key]));
        validateProjection(next, scope);
        // All reads are complete. create() protects journal/guards from overwrite.
        tx.create(db.doc(`${paths.journal}/${entry.id}`), entry);
        tx.create(operationRef, { schemaVersion: 1, intent, actorId: actor.actorId, authorizationEvidenceId: actor.authorizationEvidenceId, recordedAt, journalId: entry.id });
        tx.set(db.doc(paths.account), next);
        for (const [key, change] of Object.entries(entry.lotChanges)) {
          const ref = db.doc(`${paths.lots}/${key}`);
          if (change.after === null) tx.delete(ref); else tx.set(ref, change.after);
        }
        if (entry.allocation) tx.create(db.doc(`${paths.allocations}/${entry.id}`), entry.allocation);
        if (sourceRef) tx.create(sourceRef, { schemaVersion: 1, accountKey: accountKey(scope), journalId: entry.id });
        if (!guard.exists) tx.create(policyGuard, { schemaVersion: 1, hash: hash(policy) });
        if (reversalRef) tx.create(reversalRef, { schemaVersion: 1, journalId: entry.id });
        return { entry, duplicate: false };
      }, { maxAttempts: 5 });
    },
  };
}
