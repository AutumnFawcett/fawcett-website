// Tests only. Serializes test transactions globally; buffers writes until success.
// This demonstrates the port's atomic semantics, NOT Firestore concurrency.
import { canonical } from "../../lib/ledger/schemas.mjs";
export function memoryStore() {
  const histories = new Map(), sources = new Map();
  let tail = Promise.resolve();
  return {
    async transaction(scope, callback) {
      const key = canonical(scope), previous = tail;
      let unlock;
      const turn = new Promise(resolve => { unlock = resolve; });
      tail = turn;
      await previous;
      try {
        const history = structuredClone(histories.get(key) || []);
        const stagedSources = new Map();
        const result = await callback({
          readSource: async source => sources.get(source) || null,
          readEntries: async () => structuredClone(history),
          append: async (entry, revision) => {
            if (history.length !== revision || history.some(e => e.id === entry.id)) throw Error("revision_conflict");
            if (entry.sourceKey) {
              if (sources.has(entry.sourceKey)) throw Error("duplicate_provider_source");
              stagedSources.set(entry.sourceKey, { account: key, journalId: entry.id });
            }
            history.push(structuredClone(entry));
          },
        });
        histories.set(key, history);
        for (const [source, value] of stagedSources) sources.set(source, value);
        return result;
      } finally { unlock(); }
    },
    entries: scope => structuredClone(histories.get(canonical(scope)) || []),
  };
}
