import { WRITE_FENCE_PATH, writesOpen, maintenanceError } from "./writeFence.mjs";
const facades = new WeakMap();
// Used by every HTTP Admin SDK entry point. The raw SDK remains privileged:
// this is application enforcement, not a substitute for draining other writers.
export function fencedFirestore(database) {
  if (facades.has(database)) return facades.get(database);
  const originals = new WeakMap(), wrapped = new WeakMap();
  const unwrap = value => originals.get(value) || value;
  const transaction = (callback, options) => database.runTransaction(async raw => {
    const state = (await raw.get(database.doc(WRITE_FENCE_PATH))).data();
    const tx = new Proxy(raw, { get(target, key) {
      if (["set", "update", "create", "delete"].includes(key)) return (...args) => {
        if (!writesOpen(state)) throw maintenanceError();
        target[key](...args.map(unwrap)); return tx;
      };
      if (key === "get" || key === "getAll") return (...args) => target[key](...args.map(unwrap));
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } });
    return callback(tx);
  }, options);
  function wrap(target) {
    if (wrapped.has(target)) return wrapped.get(target);
    const proxy = new Proxy(target, { get(object, key) {
      if (object === database && key === "runTransaction") return transaction;
      if (object === database && ["bulkWriter", "recursiveDelete"].includes(key)) return () => { throw new Error("unsupported_privileged_writer"); };
      if (object === database && key === "batch") return () => {
        const operations = [], batch = {};
        for (const method of ["set", "update", "create", "delete"]) batch[method] = (...args) => { operations.push([method, args]); return batch; };
        batch.commit = () => transaction(tx => { for (const [method, args] of operations) tx[method](...args); });
        return batch;
      };
      if (["set", "update", "create", "delete"].includes(key)) return (...args) => transaction(tx => { tx[key](object, ...args); });
      const value = Reflect.get(object, key, object);
      if (typeof value !== "function") return value;
      return (...args) => {
        const result = value.apply(object, args.map(unwrap));
        // Only references/queries are wrapped; snapshots and SDK values retain
        // native identity. Snapshot refs used in transactions are fenced there.
        return result && typeof result === "object" && (typeof result.get === "function" || result === database) && typeof result.then !== "function" ? wrap(result) : result;
      };
    } });
    wrapped.set(target, proxy); originals.set(proxy, target); return proxy;
  }
  const result = wrap(database); facades.set(database, result); facades.set(result, result); return result;
}
export async function assertServerWritesOpen(firestore, expectedEpoch) {
  const value = (await firestore.doc(WRITE_FENCE_PATH).get()).data();
  if (!writesOpen(value) || (expectedEpoch !== undefined && value.epoch !== expectedEpoch)) throw maintenanceError();
  return value;
}
