import { COLLECTIONS, fingerprint, requireValue, references, sourcePath } from "../lib/migration/model.mjs";
import { WRITE_FENCE_PATH, writesOpen } from "../lib/safety/writeFence.mjs";
import { assertOperator, SOURCE_ROOTS } from "./runtime.mjs";
import { closedFence } from "./authorization.mjs";
import { OPERATOR_VERSION, candidate, sealManifest, validateManifest, safeReason, viewPath, policyPath, journalPath, identifier, validateInventory } from "./model.mjs";
const technicalRoots = new Set(["operatorRuns", "portalRecords", "publicationRecords", "migrationOperatorAuthorizations"]);
const rowVersion = snap => ({ created: snap.created, updated: snap.updated });
const same = (left, right) => fingerprint(left) === fingerprint(right);
export async function inventory(runtime) {
  assertOperator(runtime);
  const initial = await runtime.read(WRITE_FENCE_PATH), records = [];
  let fence = null, frozen = false;
  try { fence = closedFence(initial); frozen = true; }
  catch { if (initial.exists && writesOpen(initial.data)) fence = { epoch: initial.data.epoch, controlHash: fingerprint(initial.data), version: initial.updated }; }
  for (const name of SOURCE_ROOTS) for (const snap of await runtime.scan(name)) {
    let sourceHash = null, disposition = "supported";
    try { sourceHash = fingerprint(snap.data); } catch { disposition = "unsupported_type"; }
    const children = await runtime.children(snap.path);
    if (children.length) disposition = "unexpanded_subcollections";
    if (name === "studioClients") disposition = "studio_private";
    else if (!COLLECTIONS.includes(name)) disposition = "private_business_record";
    records.push({ path: snap.path, sourceHash, version: rowVersion(snap), disposition, children });
    requireValue(records.length <= 5000, "inventory_limit_exceeded");
  }
  records.sort((a, b) => a.path.localeCompare(b.path));
  const destinations = [];
  for (const name of COLLECTIONS.filter(name => name !== "studioClients")) {
    for (const root of ["portalRecords", "publicationRecords"]) for (const snap of await runtime.scan(`${root}/${name}/records`)) {
      let hash = null; try { hash = fingerprint(snap.data); } catch { /* An opaque destination is a conflict, never overwritten. */ }
      destinations.push({ path: snap.path, hash, version: rowVersion(snap) });
      requireValue(destinations.length <= 10000, "inventory_limit_exceeded");
    }
  }
  destinations.sort((a, b) => a.path.localeCompare(b.path));
  const roots = (await runtime.roots()).filter(name => !technicalRoots.has(name));
  const unrecognizedRoots = roots.filter(name => !SOURCE_ROOTS.includes(name) && name !== "systemControls");
  const final = await runtime.read(WRITE_FENCE_PATH);
  requireValue(same(initial, final), "fence_changed_during_inventory");
  const body = { schemaVersion: 1, syntheticOnly: true, adapterVersion: OPERATOR_VERSION, identity: runtime.identity, frozen, fence, roots, unrecognizedRoots, records, destinations };
  return { ...body, snapshotHash: fingerprint(body) };
}
export function prepareManifest(snapshot, runId, evidence) {
  identifier(runId);
  // Deliberately NOT a valid executable approval: evidence must be completed by
  // humans and every record is withheld until an independent explicit review.
  return { schemaVersion: 2, syntheticOnly: true, adapterVersion: OPERATOR_VERSION, identity: snapshot.identity, runId, inventory: snapshot, evidence,
    decisions: snapshot.records.map(row => ({ path: row.path, sourceHash: row.sourceHash, state: "withheld", reason: "human_review_pending" })) };
}
function unchanged(snapshot, row) {
  requireValue(snapshot.exists && fingerprint(snapshot.data) === row.sourceHash && same(rowVersion(snapshot), row.version), "frozen_source_changed");
}
export async function prepareApproval(runtime, snapshot, path, fields) {
  assertOperator(runtime); validateInventory(snapshot); const row = snapshot.records.find(row => row.path === path);
  requireValue(row?.disposition === "supported", "unsupported_source_withheld");
  requireValue(same(snapshot.fence, closedFence(await runtime.read(WRITE_FENCE_PATH))), "manifest_fence_changed");
  const source = await runtime.read(path); unchanged(source, row);
  const [name, id] = sourcePath(path), data = source.data;
  requireValue(typeof data.clientUid === "string" && data.clientUid.length > 0 && (name !== "clients" || id === data.clientUid), "uncertain_owner");
  const chosen = candidate(name, data, fields);
  const account = await runtime.account(data.clientUid);
  requireValue(!account.disabled, "disabled_owner");
  for (const link of references(data)) requireValue((await runtime.read(link)).data?.clientUid === data.clientUid, "relationship_owner_mismatch");
  return { syntheticOnly: true, path, sourceHash: row.sourceHash, candidateHash: fingerprint(chosen), fields, clientUid: data.clientUid, accountHash: fingerprint(account), candidate: chosen, ownerConfirmed: false, contentReviewed: false, reviewerUid: null };
}
export async function prepareAuthorization(runtime, input, operation) {
  assertOperator(runtime); const manifest = sealManifest(input); validateManifest(manifest);
  requireValue(["apply", "withdraw"].includes(operation), "unsupported_operator_operation");
  const fence = closedFence(await runtime.read(WRITE_FENCE_PATH));
  if (operation === "apply") requireValue(same(fence, manifest.inventory.fence), "manifest_fence_changed");
  const now = Date.now();
  return { schemaVersion: 1, syntheticOnly: true, identity: runtime.identity, enabled: false,
    runId: manifest.runId, manifestHash: fingerprint(manifest), operation,
    operatorUid: manifest.evidence.operatorUid, ownerUid: manifest.evidence.ownerUid, reviewerUid: manifest.evidence.reviewerUid,
    fence, notBefore: now, expiresAt: operation === "apply" ? Math.min(manifest.evidence.expiresAt, now + 3600000) : now + 3600000 };
}
async function assess(runtime, manifest, decision, read) {
  const row = manifest.inventory.records.find(row => row.path === decision.path), source = await read(decision.path);
  unchanged(source, row);
  const [name, id] = sourcePath(decision.path), data = source.data;
  requireValue(data.clientUid === decision.clientUid && (name !== "clients" || id === data.clientUid), "ownership_conflict");
  const account = await runtime.account(data.clientUid);
  requireValue(!account.disabled, "disabled_owner");
  requireValue(fingerprint(account) === decision.accountHash, "auth_identity_changed");
  const approved = candidate(name, data, decision.fields);
  requireValue(fingerprint(approved) === decision.candidateHash, "candidate_changed");
  for (const path of references(data)) {
    const linked = await read(path), baseline = manifest.inventory.records.find(row => row.path === path);
    requireValue(baseline && linked.data?.clientUid === data.clientUid, "relationship_owner_mismatch"); unchanged(linked, baseline);
  }
  if (name === "messages") {
    requireValue(data.senderRole === "client" ? data.senderUid === data.clientUid : data.senderRole === "admin" && typeof data.senderUid === "string" && (await read(`adminUsers/${data.senderUid}`)).data?.active === true, "uncertain_message_sender");
    if (data.senderRole === "admin") requireValue(!(await runtime.account(data.senderUid)).disabled, "inactive_message_sender");
    const conversation = await read(`conversations/${data.conversationId}`);
    for (const key of ["consultRequestId", "applicationId", "membershipChangeRequestId", "membershipOfferResponseId"]) requireValue((data[key] || null) === (conversation.data?.[key] || null), "message_relationship_mismatch");
  }
  return approved;
}
async function destinationState(manifest, decision, read) {
  const [view, policy, journal, root] = await Promise.all([read(viewPath(decision.path)), read(policyPath(decision.path)), read(journalPath(manifest, decision.path)), read(`operatorRuns/${manifest.runId}`)]);
  const hash = fingerprint(manifest);
  if (root.exists) requireValue(root.data.manifestHash === hash && fingerprint(root.data.manifest) === hash && same(root.created, root.updated), "immutable_run_changed");
  if (journal.exists) {
    const j = journal.data;
    requireValue(root.exists && j.manifestHash === hash && j.path === decision.path && j.sourceHash === decision.sourceHash && j.candidateHash === decision.candidateHash && j.authorization?.operatorUid === manifest.evidence.operatorUid && j.authorization?.operation === "apply" && same(j.authorization.fence, manifest.inventory.fence), "journal_binding_changed");
    if (j.state === "withdrawn") {
      requireValue(!view.exists && policy.data?.state === "withheld" && policy.data?.runId === manifest.runId && same(policy.updated, journal.updated) && !same(journal.created, journal.updated), "withdrawn_destination_changed");
      return { state: "withdrawn", view, policy, journal, root };
    }
    requireValue(j.state === "committed" && view.exists && fingerprint(view.data) === decision.candidateHash, "destination_changed");
    requireValue(policy.data?.state === "approved" && policy.data?.runId === manifest.runId && policy.data?.sourceHash === decision.sourceHash && policy.data?.projectionHash === decision.candidateHash && fingerprint(policy.data.approved) === decision.candidateHash, "publication_policy_changed");
    requireValue(same(view.created, journal.created) && same(view.updated, journal.created) && same(policy.updated, journal.created) && same(journal.updated, journal.created), "destination_version_changed");
    return { state: "committed", view, policy, journal, root };
  }
  requireValue(!view.exists, "unexpected_destination");
  const baseline = manifest.inventory.destinations.find(row => row.path === policyPath(decision.path));
  if (policy.exists) {
    const known = ["schemaVersion", "state", "mode", "actorUid", "revision", "sourceHash", "projectionHash", "runId", "reviewedAt", "withdrawnAt"];
    requireValue(policy.data.schemaVersion === 1 && Object.keys(policy.data).every(key => known.includes(key)), "unexpected_publication_policy_shape");
  }
  requireValue(!policy.exists || policy.data.state === "withheld" && baseline && baseline.hash === fingerprint(policy.data) && same(rowVersion(policy), baseline.version), "unexpected_publication_policy");
  return { state: "eligible", view, policy, journal, root };
}
function result(manifest, records, extra = {}) {
  const counts = Object.fromEntries(["eligible", "withheld", "error", "created", "already_committed", "withdrawn", "already_withdrawn", "pending"].map(state => [state, records.filter(row => row.state === state).length]));
  return { syntheticOnly: true, runId: manifest.runId, manifestHash: fingerprint(manifest), total: records.length, scopeRecords: manifest.inventory.records.length, globalErrors: records.filter(row => row.path === null && row.state === "error").length, counts, records, ...extra };
}
async function frozenInventory(runtime, manifest) {
  const current = await inventory(runtime);
  requireValue(same(current.records, manifest.inventory.records) && same(current.roots, manifest.inventory.roots), "frozen_inventory_changed");
  const allowed = new Set(manifest.decisions.filter(row => row.state === "approved").flatMap(row => [viewPath(row.path), policyPath(row.path)]));
  requireValue(same(current.destinations.filter(row => !allowed.has(row.path)), manifest.inventory.destinations.filter(row => !allowed.has(row.path))), "unapproved_destination_changed");
}
export async function reconcile(runtime, input) {
  assertOperator(runtime); const manifest = sealManifest(input); validateManifest(manifest);
  const records = [];
  try { await frozenInventory(runtime, manifest); }
  catch (error) { return result(manifest, [{ path: null, state: "error", reason: safeReason(error) }], { stopped: true }); }
  const sourcePaths = new Set(manifest.inventory.records.map(row => row.path));
  for (const destination of manifest.inventory.destinations) {
    const [, name, , id] = destination.path.split("/");
    if (!sourcePaths.has(`${name}/${id}`)) records.push({ path: `${name}/${id}`, state: "error", reason: "orphan_destination" });
  }
  for (const decision of manifest.decisions) {
    if (decision.state === "withheld") {
      const [name, id] = decision.path.split("/");
      const view = !COLLECTIONS.includes(name) || name === "studioClients" ? { exists: false } : await runtime.read(`portalRecords/${name}/records/${id}`);
      records.push({ path: decision.path, state: view.exists ? "error" : "withheld", reason: view.exists ? "withheld_record_has_destination" : decision.reason }); continue;
    }
    try {
      await assess(runtime, manifest, decision, path => runtime.read(path));
      const state = await destinationState(manifest, decision, path => runtime.read(path));
      records.push({ path: decision.path, state: state.state === "committed" ? "already_committed" : state.state === "withdrawn" ? "already_withdrawn" : "eligible" });
    } catch (error) { records.push({ path: decision.path, state: "error", reason: safeReason(error) }); }
  }
  return result(manifest, records);
}
export async function execute(runtime, input, { operation, grantId, limit = 500 } = {}) {
  assertOperator(runtime); const manifest = sealManifest(input); validateManifest(manifest);
  requireValue(["apply", "withdraw"].includes(operation) && Number.isSafeInteger(limit) && limit > 0 && limit <= 500, "invalid_execution_options");
  const context = { manifest, grantId, operation };
  // Preflight authorization and the entire manifest before creating a run/journal.
  await runtime.transaction(context, async () => {});
  const preflight = await reconcile(runtime, manifest);
  if (preflight.counts.error) return { ...preflight, stopped: true };
  if (operation === "apply" && preflight.counts.already_withdrawn) return result(manifest, [{ path: null, state: "error", reason: "withdrawn_run_is_terminal" }], { stopped: true });
  const records = manifest.decisions.filter(row => row.state === "withheld").map(row => ({ path: row.path, state: "withheld", reason: row.reason }));
  const selected = manifest.decisions.filter(row => row.state === "approved"); let processed = 0;
  for (const decision of selected) {
    if (processed >= limit) { records.push({ path: decision.path, state: "pending" }); continue; }
    try {
      const state = await runtime.transaction(context, async tx => {
        const approved = await assess(runtime, manifest, decision, tx.read);
        const destination = await destinationState(manifest, decision, tx.read);
        const hash = fingerprint(manifest), rootPath = `operatorRuns/${manifest.runId}`;
        if (operation === "apply") {
          requireValue(destination.state !== "withdrawn", "withdrawn_run_is_terminal");
          if (destination.state === "committed") return "already_committed";
          if (!destination.root.exists) tx.create(rootPath, { manifestHash: hash, manifest, syntheticOnly: true, createdAt: tx.timestamp() });
          tx.create(viewPath(decision.path), approved);
          tx.set(policyPath(decision.path), { schemaVersion: 1, state: "approved", mode: "operator_review", actorUid: manifest.evidence.reviewerUid, sourceHash: decision.sourceHash, projectionHash: decision.candidateHash, approved, revision: (destination.policy.data?.revision || 0) + 1, runId: manifest.runId, reviewedAt: tx.timestamp() });
          tx.create(journalPath(manifest, decision.path), { manifestHash: hash, path: decision.path, sourceHash: decision.sourceHash, candidateHash: decision.candidateHash, state: "committed", authorization: tx.authorization, createdAt: tx.timestamp() });
          return "created";
        }
        if (destination.state === "eligible") return "withheld";
        if (destination.state === "withdrawn") return "already_withdrawn";
        tx.remove(viewPath(decision.path));
        tx.set(policyPath(decision.path), { schemaVersion: 1, state: "withheld", revision: (destination.policy.data?.revision || 0) + 1, runId: manifest.runId, withdrawnAt: tx.timestamp() });
        tx.update(journalPath(manifest, decision.path), { manifestHash: hash, path: decision.path, state: "withdrawn", withdrawalAuthorization: tx.authorization, withdrawnAt: tx.timestamp() });
        return "withdrawn";
      });
      records.push({ path: decision.path, state }); if (["created", "withdrawn"].includes(state)) processed++;
    } catch (error) {
      records.push({ path: decision.path, state: "error", reason: safeReason(error) });
      for (const remaining of selected.slice(selected.indexOf(decision) + 1)) records.push({ path: remaining.path, state: "pending" });
      return result(manifest, records, { stopped: true });
    }
  }
  // Even an unrelated privileged source edit must invalidate the final result.
  try { await frozenInventory(runtime, manifest); await runtime.transaction(context, async () => {}); }
  catch (error) { records.push({ path: null, state: "error", reason: safeReason(error) }); }
  return result(manifest, records, { stopped: records.some(row => ["error", "pending"].includes(row.state)) });
}
