import { add, canonical } from "../schemas.mjs";
import { validateManifest, sourceKey, importId, providerKey, digest, allocationTotal, purchased, bucketKey, compare, recordSetHash } from "./manifest.mjs";
const unique = values => [...new Set(values)].sort();
const index = (rows, key) => {
  const result = new Map();
  for (const row of rows) { const k = key(row); if (!result.has(k)) result.set(k, []); result.get(k).push(row); }
  return result;
};

export function reconcileLegacy(input) {
  const manifest = validateManifest(input), manifestHash = digest(manifest);
  const manifestReviewReasons = [];
  if (!manifest.snapshot.complete || !manifest.snapshot.coverageEvidenceId || manifest.snapshot.capturedAt < manifest.cutoffAt
    || manifest.snapshot.recordCount !== manifest.records.length || manifest.snapshot.recordSetHash !== recordSetHash(manifest.records)) manifestReviewReasons.push("snapshot_coverage_unapproved_or_changed");
  const sourceIndex = index(manifest.records, sourceKey), providerIndex = index(manifest.records.filter(row => providerKey(row) && !row.mirrorOf), providerKey);
  const clients = index(manifest.identities, row => row.uid), emails = index(manifest.identities.filter(row => row.emailKey), row => row.emailKey);
  const projects = index(manifest.projects, row => row.id), appointments = index(manifest.appointments, row => row.id);
  const imports = index(manifest.existingImports, row => row.sourceKey), existingProviders = index(manifest.existingImports.filter(row => row.providerKey), row => row.providerKey);
  const accounts = index(manifest.existingAccounts, row => row.clientUid), strategies = index(manifest.strategies, row => row.clientUid);
  const observations = index(manifest.observations, row => row.clientUid);
  const sourceProjects = index(manifest.sourceProjects, row => row.projectId);
  const manualReceipts = index(manifest.records.filter(row => row.kind === "receipt" && row.manualEvidenceId && !row.mirrorOf), row => digest([row.environment, row.manualEvidenceId]));
  const adjustments = index(manifest.records.filter(row => ["credit_use", "refund", "adjustment"].includes(row.kind) && row.manualEvidenceId && !row.mirrorOf), row => digest([row.environment, row.manualEvidenceId]));
  const approvals = index(manifest.records.filter(row => row.adjustmentApprovalId && !row.mirrorOf), row => row.adjustmentApprovalId);
  const decisions = manifest.records.map(row => {
    const key = sourceKey(row), reasons = [], exclusions = [], uid = row.resolvedClientUid;
    const addReason = reason => reasons.push(reason);
    const identity = clients.get(uid) || [];
    if (!uid || identity.length !== 1 || row.identityEvidenceId !== identity[0]?.evidenceId
      || (row.originalClientUid && row.originalClientUid !== uid)
      || (row.emailKey && (emails.get(row.emailKey)?.length !== 1 || identity[0]?.emailKey !== row.emailKey))) addReason("identity_conflict_or_unresolved");
    if (sourceIndex.get(key).length !== 1) addReason("duplicate_source_record");
    const sourceProject = sourceProjects.get(row.source.projectId) || [];
    if (sourceProject.length !== 1 || sourceProject[0].environment !== row.environment) addReason("source_environment_unresolved");
    if (!["payments", "creditLedger"].includes(row.source.collection) && !row.source.collection.startsWith("tattooSandbox")) addReason("source_schema_unmapped");
    if (row.currency !== "CAD") addReason("currency_missing_or_unsupported");
    if (!["context", "snapshot", "dispute"].includes(row.kind) && row.amountCents === 0) addReason("nonpositive_financial_amount");
    if (row.environment !== manifest.environment || row.source.collection.startsWith("tattooSandbox")) exclusions.push("environment_excluded");
    if (!row.originalTimestamp || row.timestampBasis === "unknown") addReason("timestamp_provenance_missing");
    else if (Date.parse(row.originalTimestamp) > Date.parse(manifest.cutoffAt)) exclusions.push("after_cutoff");
    if (manifest.exclusions.some(e => e.sourceKey === key)) exclusions.push("explicit_exclusion");
    if (row.provider?.sourceType === "EXTERNAL" || row.provider?.externalDetailsPresent) exclusions.push("external_bookkeeping_excluded");
    const existing = imports.get(key) || [];
    if (existing.length) {
      if (existing.length === 1 && existing[0].clientUid === uid && existing[0].recordHash === row.source.recordHash && existing[0].importId === importId(row)) exclusions.push("already_imported");
      else addReason("existing_import_conflict");
    }
    if (manifest.existingImports.some(e => e.importId === importId(row) && e.sourceKey !== key)
      || manifest.existingAccounts.some(a => a.journalIds.includes(importId(row))) && !exclusions.includes("already_imported")) addReason("journal_id_collision");
    const providerId = providerKey(row);
    if (providerId && !row.mirrorOf && (providerIndex.get(providerId)?.length !== 1 || existingProviders.has(providerId) && !exclusions.includes("already_imported"))) addReason("duplicate_provider_identity");
    const project = row.projectId ? projects.get(row.projectId) || [] : [];
    if (row.projectId && (project.length !== 1 || project[0].clientUid !== uid)) addReason("project_missing_or_cross_client");
    const appointment = row.appointmentId ? appointments.get(row.appointmentId) || [] : [];
    if (row.appointmentId && (appointment.length !== 1 || appointment[0].clientUid !== uid
      || appointment[0].projectId !== row.projectId)) addReason("appointment_missing_or_cross_client");
    const artist = appointment[0]?.artistId || project[0]?.artistId;
    if (row.artistId && artist !== row.artistId) addReason("artist_unresolved_or_conflicting");
    if (row.kind === "dispute") addReason("dispute_reservation_review");
    if (["snapshot", "context"].includes(row.kind)) exclusions.push("context_not_new_money");
    if (!["paid", "partial"].includes(row.status) && !["snapshot", "context", "dispute"].includes(row.kind)) {
      if (row.kind === "refund" && row.status === "refunded") addReason("legacy_refund_status_review");
      else exclusions.push("unreceived_status");
    }
    if (row.paymentType === "booking_fee_deposit") addReason("booking_fee_advance_ambiguity");
    const total = allocationTotal(row);
    if (total > row.amountCents) addReason("overallocated");
    if (total < row.amountCents && !["context", "snapshot", "dispute"].includes(row.kind)) addReason("partially_unallocated");
    if (new Set(row.allocations.map(a => a.id)).size !== row.allocations.length) addReason("duplicate_allocation_id");
    for (const allocation of row.allocations) {
      if (allocation.projectId !== row.projectId || allocation.appointmentId !== row.appointmentId || allocation.artistId !== row.artistId) addReason("allocation_scope_mismatch");
      if (purchased(allocation.kind) && (!allocation.policy || !allocation.policy.acceptanceEvidenceId)) addReason("policy_or_acceptance_missing");
      if (allocation.kind === "studio_credit" && (allocation.projectId || allocation.artistId || allocation.appointmentId)) addReason("restricted_studio_credit");
      if (allocation.kind === "tattoo_credit" && !allocation.projectId) addReason("tattoo_project_missing");
      if (["appointment_booking_fee", "appointment_advance"].includes(allocation.kind) && !allocation.appointmentId) addReason("appointment_required");
      if (allocation.kind === "other") addReason("allocation_nature_unresolved");
    }
    let providerConfirmed = false;
    if (row.provider) {
      const p = row.provider;
      providerConfirmed = row.kind === "receipt" && p.verification === "readback_verified" && p.sourceType === "CARD" && !p.externalDetailsPresent
        && p.status === "COMPLETED" && !!p.evidenceId && !!p.readbackHash && !!providerId && p.name === "square"
        && p.clientUid === uid && p.amountCents === row.amountCents && p.currency === row.currency && p.environment === row.environment;
      if (!providerConfirmed) addReason("provider_unverified_or_mismatched");
    }
    if (row.kind === "receipt") {
      if (row.manualEvidenceId && !row.mirrorOf && manualReceipts.get(digest([row.environment, row.manualEvidenceId])).length !== 1) addReason("duplicate_manual_receipt_evidence");
      if (!row.method) addReason("payment_method_missing");
      if (!row.paymentType) addReason("payment_type_missing");
      if (row.method && !["cash", "etransfer", "debit", "credit_card", "square", "stripe", "afterpay_financing", "gift_certificate_tattoo_credit", "in_studio_credit", "other"].includes(row.method)) addReason("payment_method_unmapped");
      if (["in_studio_credit", "gift_certificate_tattoo_credit"].includes(row.method)) addReason("credit_tender_is_not_new_cash");
      else if (!providerConfirmed && !row.manualEvidenceId) addReason("received_payment_unverified");
      if (["square", "credit_card", "debit", "stripe", "afterpay_financing"].includes(row.method) && !providerConfirmed) addReason("electronic_provider_review");
    }
    if (row.kind === "adjustment" && (!row.adjustmentApprovalId || !row.manualEvidenceId)) addReason("historical_adjustment_unapproved");
    if (["credit_use", "refund", "adjustment"].includes(row.kind)) {
      if (!row.manualEvidenceId) addReason("financial_event_evidence_missing");
      else if (!row.mirrorOf && adjustments.get(digest([row.environment, row.manualEvidenceId])).length !== 1) addReason("duplicate_financial_event_evidence");
      if (row.allocations.some(a => !purchased(a.kind))) addReason("credit_consumption_bucket_missing");
    }
    if (row.adjustmentApprovalId && !row.mirrorOf && approvals.get(row.adjustmentApprovalId).length !== 1) addReason("duplicate_adjustment_approval");
    if (["credit_use", "refund"].includes(row.kind)) {
      const references = sourceIndex.get(row.relatedSourceKey) || [];
      const original = references[0];
      if (references.length !== 1 || !["receipt", "adjustment"].includes(original.kind)
        || original.resolvedClientUid !== uid || original.environment !== row.environment) addReason("funding_reference_missing_or_cross_client");
      else for (const a of row.allocations) if (!original.allocations.some(b => bucketKey(a) === bucketKey(b))) addReason("restricted_funding_mismatch");
      if (original?.originalTimestamp && row.originalTimestamp && row.originalTimestamp < original.originalTimestamp) addReason("usage_precedes_funding");
      if (row.kind === "refund" && (!row.manualEvidenceId || !row.adjustmentApprovalId)) addReason("refund_evidence_or_approval_missing");
    }
    const expectedEffect = row.kind === "receipt" ? ["add", "none"] : row.kind === "credit_use" ? ["use"]
      : row.kind === "refund" ? ["remove"] : row.kind === "adjustment" ? ["add", "remove"] : ["none"];
    if (!expectedEffect.includes(row.creditEffect)) addReason("credit_effect_conflict");
    if (row.mirrorOf) {
      const originals = sourceIndex.get(row.mirrorOf) || [], original = originals[0];
      if (row.source.collection !== "creditLedger" || originals.length !== 1 || original.mirrorOf || !row.mirrorApprovalId
        || row.resolvedClientUid !== original.resolvedClientUid || row.environment !== original.environment
        || row.amountCents !== original.amountCents || row.creditEffect !== original.creditEffect
        || canonical(row.allocations) !== canonical(original.allocations)
        || row.provider && providerKey(row) !== providerKey(original)) addReason("mirror_link_conflict");
      else exclusions.push("reviewed_credit_ledger_mirror");
    } else if (row.source.collection === "creditLedger") addReason("standalone_credit_ledger_review");
    if ((strategies.get(uid) || []).length !== 1) addReason("strategy_missing_or_mixed");
    const sign = row.creditEffect === "add" ? 1 : ["use", "remove"].includes(row.creditEffect) ? -1 : 0;
    if (row.creditEffect === "none" && row.allocations.some(a => purchased(a.kind))) addReason("purchased_allocation_without_credit_effect");
    const delta = row.allocations.filter(a => purchased(a.kind)).reduce((sum,a) => add(sum, sign * a.amountCents), 0);
    return { sourceKey: key, importId: importId(row), clientUid: uid, providerKey: providerId, providerConfirmed: providerConfirmed && !reasons.length && !exclusions.length,
      recordHash: row.source.recordHash, classification: reasons.length ? "review" : exclusions.length ? "excluded" : "candidate",
      reasons: unique([...reasons, ...exclusions]), unallocatedCents: Math.max(0, row.amountCents - total),
      proposedCreditDeltaCents: reasons.length || exclusions.length ? 0 : delta,
      candidateCollectedCents: reasons.length || exclusions.length || row.kind !== "receipt" ? 0 : row.amountCents,
      candidateRefundCents: reasons.length || exclusions.length || row.kind !== "refund" ? 0 : row.amountCents };
  }).sort((a,b) => compare(a.sourceKey, b.sourceKey) || compare(canonical(a), canonical(b)));

  // Independently cap usage against the specifically referenced original receipt,
  // not merely the client's aggregate funds from other sources in the same bucket.
  for (const [key, rows] of sourceIndex) {
    if (rows.length !== 1) continue;
    const related = decisions.filter(d => d.classification === "candidate" && ["credit_use", "refund"].includes(sourceIndex.get(d.sourceKey)?.[0]?.kind)
      && sourceIndex.get(d.sourceKey)?.[0]?.relatedSourceKey === key);
    const usage = new Map();
    for (const d of related) for (const a of sourceIndex.get(d.sourceKey)[0].allocations.filter(a => purchased(a.kind))) {
      const bucket = bucketKey(a); usage.set(bucket, add(usage.get(bucket) || 0, a.amountCents));
    }
    if ([...usage].some(([bucket, amount]) => amount > rows[0].allocations.filter(a => bucketKey(a) === bucket).reduce((sum,a) => add(sum,a.amountCents),0))) {
      for (const d of related) { d.classification = "review"; d.reasons = unique([...d.reasons, "funding_overconsumed"]); d.proposedCreditDeltaCents = 0; d.candidateRefundCents = 0; }
    }
  }

  // Dependents cannot release/consume value whose source is held or excluded.
  const decisionIndex = index(decisions, row => row.sourceKey);
  for (const decision of decisions) {
    const row = sourceIndex.get(decision.sourceKey)?.[0];
    if (["credit_use", "refund"].includes(row?.kind) && decision.classification === "candidate"
      && decisionIndex.get(row.relatedSourceKey)?.[0]?.classification !== "candidate") {
      decision.classification = "review"; decision.reasons = unique([...decision.reasons, "funding_not_candidate"]);
      decision.proposedCreditDeltaCents = 0; decision.candidateCollectedCents = 0;
      decision.candidateRefundCents = 0;
    }
  }
  const clientReports = unique([...clients.keys(), ...strategies.keys(), ...accounts.keys(), ...observations.keys(), ...decisions.map(d => d.clientUid).filter(Boolean)]).map(uid => {
    const own = decisions.filter(d => d.clientUid === uid), issues = [...manifestReviewReasons];
    const existing = accounts.get(uid) || [], strategy = strategies.get(uid) || [], seen = observations.get(uid) || [];
    if (existing.length > 1 || strategy.length !== 1 || seen.length !== 1) issues.push("account_strategy_or_observation_ambiguous");
    if (strategy[0]?.mode === "opening_balance" && (existing[0]?.revision || existing[0]?.purchasedCents)) issues.push("opening_balance_would_overlap_existing_journal");
    const buckets = new Map();
    for (const d of own.filter(d => d.classification === "candidate")) {
      const row = sourceIndex.get(d.sourceKey)[0], sign = row.creditEffect === "add" ? 1 : ["use", "remove"].includes(row.creditEffect) ? -1 : 0;
      for (const a of row.allocations.filter(a => purchased(a.kind))) {
        const key = bucketKey(a), before = buckets.get(key) || { key, kind: a.kind, projectId: a.projectId, artistId: a.artistId, appointmentId: a.appointmentId, policy: a.policy, remainingCents: 0 };
        before.remainingCents = add(before.remainingCents, sign * a.amountCents); buckets.set(key, before);
      }
    }
    if ([...buckets.values()].some(b => b.remainingCents < 0)) issues.push("negative_restricted_bucket");
    const candidate = own.reduce((sum,d) => add(sum,d.proposedCreditDeltaCents), 0);
    const proposed = add(existing[0]?.purchasedCents || 0, candidate);
    const differences = seen.length === 1 ? Object.fromEntries(["creditPageCents", "adminLedgerCents", "dashboardCents"].map(k => [k, add(proposed, -seen[0][k])])) : null;
    if (differences && Object.values(differences).some(v => v !== 0)) issues.push("shadow_balance_discrepancy");
    if (own.some(d => d.classification === "review")) issues.push("records_require_review");
    return { clientUid: uid, strategy: strategy[0]?.mode || null, existingPurchasedCents: existing[0]?.purchasedCents || 0,
      candidateCreditDeltaCents: candidate, proposedPurchasedCents: proposed,
      candidateCollectedCents: own.reduce((sum,d) => add(sum,d.candidateCollectedCents),0),
      candidateRefundCents: own.reduce((sum,d) => add(sum,d.candidateRefundCents),0),
      buckets: [...buckets.values()].sort((a,b) => compare(a.key,b.key)), differences,
      reviewReasons: unique(issues), status: issues.length ? "review" : "shadow_match" };
  });
  return { schemaVersion: 1, mode: "shadow_only", executionAllowed: false, manifestHash, environment: manifest.environment,
    cutoffAt: manifest.cutoffAt, manifestReviewReasons, decisions, clients: clientReports,
    reviewRequired: !!manifestReviewReasons.length || decisions.some(d => d.classification === "review") || clientReports.some(c => c.status === "review") };
}
