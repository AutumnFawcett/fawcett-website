import { assertRuntime } from "../migration/runtime.mjs";
import { COLLECTIONS, fingerprint } from "../migration/model.mjs";
import { approvedSnapshot } from "./publicationState.mjs";
// Read-only, bounded, synthetic-only reconciliation. Never repairs a missing
// projection from raw source text or treats a legacy visibility flag as review.
export async function reconcilePublication(runtime, { frozenAt } = {}) {
  assertRuntime(runtime);
  if (typeof frozenAt !== "string" || !Number.isFinite(Date.parse(frozenAt))) throw new Error("freeze_timestamp_required");
  const records = [], seen = new Set(), limit = 5000;
  async function scan(query) {
    const docs = []; let cursor;
    while (true) {
      const page = await (cursor ? query.orderBy("__name__").startAfter(cursor).limit(100) : query.orderBy("__name__").limit(100)).get();
      docs.push(...page.docs);
      if (docs.length + records.length > limit) throw new Error("inventory_limit_exceeded");
      if (page.size < 100) return docs;
      cursor = page.docs.at(-1);
    }
  }
  for (const name of COLLECTIONS.filter(name => name !== "studioClients")) {
    assertRuntime(runtime);
    for (const source of await scan(runtime.firestore.collection(name))) {
      const path = source.ref.path, data = source.data(); seen.add(path);
      const [view, policy] = await Promise.all([runtime.firestore.doc(`portalRecords/${name}/records/${source.id}`).get(), runtime.firestore.doc(`publicationRecords/${name}/records/${source.id}`).get()]);
      const state = !view.exists ? "withheld_no_view" : !policy.exists ? "unreviewed_view"
        : !approvedSnapshot(policy.data(), view.data(), data.clientUid) ? "view_policy_conflict"
        : (policy.data().state === "review_required" || (policy.data().sourceHash && policy.data().sourceHash !== fingerprint(data))) ? "pending_review" : "approved";
      records.push({ path, state, lateWrite: source.updateTime.toMillis() >= Date.parse(frozenAt) });
    }
    for (const view of await scan(runtime.firestore.collection(`portalRecords/${name}/records`))) if (!seen.has(`${name}/${view.id}`)) records.push({ path: `${name}/${view.id}`, state: "missing_source", lateWrite: false });
  }
  return { syntheticOnly: true, frozenAt, total: records.length, counts: Object.fromEntries(["approved", "withheld_no_view", "unreviewed_view", "view_policy_conflict", "pending_review", "missing_source"].map(state => [state, records.filter(row => row.state === state).length])), lateWrites: records.filter(row => row.lateWrite).length, records };
}
