import { FieldValue } from "firebase-admin/firestore";
import { assertRuntime } from "./runtime.mjs";
import { COLLECTIONS, fingerprint, validateManifest, requireValue, sourcePath, candidateProjection, references } from "./model.mjs";
const stamp = () => FieldValue.serverTimestamp();
const viewPath = path => { const [name, id] = sourcePath(path); return `portalRecords/${name}/records/${id}`; };
const journalPath = (manifest, path) => `migrationRuns/${manifest.runId}/records/${fingerprint(path)}`;
async function account(runtime, uid) {
  try { const user = await runtime.auth.getUser(uid); requireValue(!user.disabled, "disabled_account"); }
  catch (e) { throw new Error(e.message === "disabled_account" ? "disabled_account" : "missing_or_unavailable_account"); }
}
async function assess(runtime, path, source, approval, read) {
  const [name, id] = sourcePath(path);
  requireValue(name !== "clients" || id === source.clientUid, "profile_id_owner_mismatch");
  const projection = candidateProjection(name, source);
  if (!approval) return { state: "withheld", reason: "not_approved" };
  requireValue(approval.clientUid === source.clientUid, "ownership_mismatch");
  requireValue(fingerprint(source) === approval.sourceHash && fingerprint(projection) === approval.projectionHash, "reviewed_record_changed");
  await account(runtime, source.clientUid);
  await account(runtime, approval.reviewerUid);
  const reviewer = await read(`adminUsers/${approval.reviewerUid}`);
  requireValue(reviewer?.active === true, "reviewer_not_active_admin");
  for (const link of references(source)) {
    const related = await read(link);
    requireValue(related && related.clientUid === source.clientUid, "missing_or_cross_client_relationship");
  }
  if (name === "messages") {
    requireValue(source.senderRole !== "client" || source.senderUid === source.clientUid, "uncertain_message_sender");
    const conversation = await read(`conversations/${source.conversationId}`);
    for (const key of ["consultRequestId", "applicationId", "membershipChangeRequestId", "membershipOfferResponseId"]) requireValue((source[key] || null) === (conversation[key] || null), "message_relationship_mismatch");
  }
  return { state: "eligible", projection };
}
const safeReason = e => /^[a-z][a-z0-9_]+$/.test(e.message) ? e.message : "assessment_failed";
async function inventory(runtime) {
  const records = [];
  for (const name of COLLECTIONS) {
    let cursor;
    while (true) {
      let query = runtime.firestore.collection(name).orderBy("__name__").limit(100);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      for (const doc of snap.docs) records.push({ path: doc.ref.path, data: doc.data() });
      requireValue(records.length <= 5000, "inventory_limit_exceeded");
      if (snap.size < 100) break;
      cursor = snap.docs.at(-1);
    }
  }
  return records;
}
function finish(manifest, records) {
  const counts = Object.fromEntries(["eligible", "withheld", "error", "migrated", "already_migrated", "rolled_back", "already_rolled_back"].map(state => [state, records.filter(r => r.state === state).length]));
  return { schemaVersion: 1, projectId: manifest.projectId, syntheticOnly: true, runId: manifest.runId, manifestHash: fingerprint(manifest), total: records.length, counts, records };
}
export async function planMigration(runtime, manifest) {
  assertRuntime(runtime); validateManifest(manifest);
  const root = await runtime.firestore.doc(`migrationRuns/${manifest.runId}`).get();
  requireValue(!root.exists || root.data().manifestHash === fingerprint(manifest), "run_manifest_changed");
  const originals = await inventory(runtime), seen = new Set();
  const read = async path => { const snap = await runtime.firestore.doc(path).get(); return snap.exists ? snap.data() : null; };
  const records = [];
  for (const { path, data } of originals) {
    seen.add(path);
    if (path.startsWith("studioClients/")) { records.push({ path, state: "withheld", reason: "studio_record_private" }); continue; }
    const approval = manifest.approvals.find(a => a.path === path);
    try {
      const result = await assess(runtime, path, data, approval, read);
      if (result.state === "eligible") {
        const view = await read(viewPath(path)), journal = await read(journalPath(manifest, path));
        if (journal) {
          requireValue(journal.manifestHash === fingerprint(manifest), "run_manifest_changed");
          requireValue(journal.state === "committed", "run_rolled_back");
          requireValue(view && fingerprint(view) === approval.projectionHash, "destination_changed");
          result.state = "already_migrated";
        } else requireValue(!view, "destination_exists");
      }
      records.push({ path, state: result.state, ...(result.reason ? { reason: result.reason } : {}) });
    } catch (e) { records.push({ path, state: approval ? "error" : "withheld", reason: safeReason(e) }); }
  }
  for (const approval of manifest.approvals) if (!seen.has(approval.path)) records.push({ path: approval.path, state: "error", reason: "approved_source_missing" });
  return finish(manifest, records);
}
export async function applyMigration(runtime, manifest, confirmation) {
  assertRuntime(runtime); validateManifest(manifest);
  requireValue(confirmation === "APPLY_APPROVED_SYNTHETIC_PROJECTIONS", "apply_confirmation_required");
  const plan = await planMigration(runtime, manifest);
  requireValue(plan.counts.error === 0, "plan_has_errors");
  const records = plan.records.filter(r => r.state === "withheld");
  for (const approval of manifest.approvals) {
    assertRuntime(runtime);
    try {
      const state = await runtime.firestore.runTransaction(async tx => {
        const read = async path => { const snap = await tx.get(runtime.firestore.doc(path)); return snap.exists ? snap.data() : null; };
        const source = await read(approval.path);
        requireValue(source, "approved_source_missing");
        const { projection } = await assess(runtime, approval.path, source, approval, read);
        const root = await read(`migrationRuns/${manifest.runId}`);
        requireValue(!root || root.manifestHash === fingerprint(manifest), "run_manifest_changed");
        const journal = await read(journalPath(manifest, approval.path));
        const destination = await read(viewPath(approval.path));
        if (journal) {
          requireValue(journal.manifestHash === fingerprint(manifest), "run_manifest_changed");
          requireValue(journal.state === "committed", "run_rolled_back");
          requireValue(destination && fingerprint(destination) === approval.projectionHash, "destination_changed");
          return "already_migrated";
        }
        requireValue(!destination, "destination_exists");
        if (!root) tx.create(runtime.firestore.doc(`migrationRuns/${manifest.runId}`), { manifestHash: fingerprint(manifest), syntheticOnly: true, createdAt: stamp() });
        tx.create(runtime.firestore.doc(viewPath(approval.path)), projection);
        tx.create(runtime.firestore.doc(journalPath(manifest, approval.path)), { path: approval.path, manifestHash: fingerprint(manifest), sourceHash: approval.sourceHash, projectionHash: approval.projectionHash, reviewerUid: approval.reviewerUid, state: "committed", createdAt: stamp() });
        return "migrated";
      });
      records.push({ path: approval.path, state });
    } catch (e) { records.push({ path: approval.path, state: "error", reason: safeReason(e) }); }
  }
  return finish(manifest, records);
}
export async function rollbackMigration(runtime, manifest, confirmation) {
  assertRuntime(runtime); validateManifest(manifest);
  requireValue(confirmation === "WITHDRAW_REHEARSAL_PROJECTIONS", "rollback_confirmation_required");
  const root = await runtime.firestore.doc(`migrationRuns/${manifest.runId}`).get();
  requireValue(!root.exists || root.data().manifestHash === fingerprint(manifest), "run_manifest_changed");
  const records = [];
  for (const approval of manifest.approvals) {
    try {
      await account(runtime, approval.reviewerUid);
      const state = await runtime.firestore.runTransaction(async tx => {
        assertRuntime(runtime);
        const journalRef = runtime.firestore.doc(journalPath(manifest, approval.path));
        const destinationRef = runtime.firestore.doc(viewPath(approval.path));
        const [journal, destination, reviewer] = await Promise.all([tx.get(journalRef), tx.get(destinationRef), tx.get(runtime.firestore.doc(`adminUsers/${approval.reviewerUid}`))]);
        requireValue(reviewer.exists && reviewer.data().active === true, "reviewer_not_active_admin");
        if (!journal.exists) return "withheld";
        requireValue(journal.data().manifestHash === fingerprint(manifest), "run_manifest_changed");
        if (journal.data().state === "rolled_back") return "already_rolled_back";
        requireValue(!destination.exists || fingerprint(destination.data()) === journal.data().projectionHash, "destination_changed");
        if (destination.exists) tx.delete(destinationRef);
        tx.update(journalRef, { state: "rolled_back", rolledBackAt: stamp() });
        return "rolled_back";
      });
      records.push({ path: approval.path, state });
    } catch (e) { records.push({ path: approval.path, state: "error", reason: safeReason(e) }); }
  }
  return finish(manifest, records);
}
