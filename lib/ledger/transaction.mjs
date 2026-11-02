import { post, rebuild } from "./engine.mjs";
import { canonical } from "./schemas.mjs";

// Port for atomic persistence, not a Firestore connection. A future server-only
// adapter MUST read a shared client revision, all relevant records, then commit
// journal + allocation + dedup keys + projections atomically with create-only IDs.
export async function postAtomically(store, scope, command, policy) {
  return store.transaction(scope, async tx => {
    const entries = await tx.readEntries();
    const before = rebuild(scope, entries);
    const result = post(before, command, policy);
    if (!result.duplicate) {
      // Global provider key is read in this same transaction, across ALL clients.
      if (result.entry.sourceKey && await tx.readSource(result.entry.sourceKey)) throw Error("duplicate_provider_source");
      await tx.append(result.entry, before.revision);
    }
    return result;
  });
}
// Deterministic reconciliation of a projection against its authoritative journal.
export function reconcile(scope, entries, projection) {
  const expected = rebuild(scope, entries);
  return { matches: canonical(expected) === canonical(projection), expected };
}
