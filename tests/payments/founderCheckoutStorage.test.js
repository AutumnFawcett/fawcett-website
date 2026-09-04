import test from "node:test";
import assert from "node:assert/strict";
import { createFounderCheckoutStorage } from "../../lib/server/founderCheckoutStorage.js";

class MemoryFirestore {
  constructor() { this.data = new Map(); this.queue = Promise.resolve(); }
  collection(name) { return { doc: (id) => ({ path: `${name}/${id}`, get: async () => this.snapshot(this.data, `${name}/${id}`) }) }; }
  snapshot(data, path) { return data.has(path) ? { exists: true, data: () => structuredClone(data.get(path)) } : { exists: false, data: () => undefined }; }
  runTransaction(callback) {
    const execute = async () => {
      const draft = structuredClone(this.data);
      const tx = {
        get: async (ref) => this.snapshot(draft, ref.path),
        create: (ref, value) => { if (draft.has(ref.path)) throw new Error("already_exists"); draft.set(ref.path, structuredClone(value)); },
        set: (ref, value) => draft.set(ref.path, structuredClone(value)),
        update: (ref, value) => { if (!draft.has(ref.path)) throw new Error("not_found"); draft.set(ref.path, { ...draft.get(ref.path), ...structuredClone(value) }); },
      };
      const result = await callback(tx);
      this.data = draft;
      return result;
    };
    const result = this.queue.then(execute, execute);
    this.queue = result.catch(() => {});
    return result;
  }
}

const time = (milliseconds = 1_000) => new Date(milliseconds);
const order = (id = "order-one", uid = "uid", offerId = "founder-10-v1") => ({
  orderId: id, clientUid: uid, offerId, provider: "square", environment: "sandbox",
  purpose: "founder", amountCents: 1000, currency: "CAD", itemName: "Founder", offerVersion: 1,
  status: "creating", providerOrderId: null, providerPaymentLinkId: null, checkoutUrl: null,
  failureCode: null, idempotencyKey: `fawcett-${id}`, createdAt: time(), updatedAt: time(),
});
const reserve = (storage, values = {}) => storage.reserveCheckoutRequest({ requestId: values.requestId || "retry_token_123456", order: values.order || order(), timestamp: values.timestamp || time() });
const values = (db, collection) => [...db.data.entries()].filter(([key]) => key.startsWith(`${collection}/`)).map(([, value]) => value);

test("first reservation atomically writes mapping, order, and rate limit", async () => {
  const db = new MemoryFirestore(); const storage = createFounderCheckoutStorage(db, {});
  const result = await reserve(storage);
  assert.equal(result.outcome, "created");
  assert.deepEqual(values(db, "paymentOrders").map((x) => x.orderId), ["order-one"]);
  assert.equal(values(db, "paymentCheckoutRequests").length, 1);
  assert.equal(values(db, "paymentCheckoutRateLimits")[0].count, 1);
});

test("sequential and concurrent reuse resolve to the mapped internal order without consuming quota", async () => {
  const db = new MemoryFirestore(); const storage = createFounderCheckoutStorage(db, {});
  await reserve(storage);
  const sequential = await reserve(storage, { order: order("unused") });
  const concurrent = await Promise.all(Array.from({ length: 4 }, (_, i) => reserve(storage, { order: order(`unused-${i}`) })));
  assert.equal(sequential.order.orderId, "order-one");
  assert.ok(concurrent.every((x) => x.outcome === "existing" && x.order.orderId === "order-one"));
  assert.equal(values(db, "paymentOrders").length, 1);
  assert.equal(values(db, "paymentCheckoutRateLimits")[0].count, 1);
});

test("UID and offer conflicts fail closed", async () => {
  const db = new MemoryFirestore(); const storage = createFounderCheckoutStorage(db, {}); await reserve(storage);
  assert.equal((await reserve(storage, { order: order("x", "other") })).outcome, "conflict");
  assert.equal((await reserve(storage, { order: order("x", "uid", "digital-founder-25-v1") })).outcome, "conflict");
});

test("missing or mismatched mapped orders fail closed", async () => {
  for (const mutation of [
    (db) => { for (const key of db.data.keys()) if (key.startsWith("paymentOrders/")) db.data.delete(key); },
    (db) => { for (const [key, value] of db.data) if (key.startsWith("paymentOrders/")) db.data.set(key, { ...value, orderId: "embedded-mismatch" }); },
  ]) {
    const db = new MemoryFirestore(); const storage = createFounderCheckoutStorage(db, {}); await reserve(storage); mutation(db);
    await assert.rejects(reserve(storage, { order: order("unused") }), /checkout_request_inconsistent/);
  }
});

test("rate limit allows five new requests, blocks the sixth, and existing requests bypass it", async () => {
  const db = new MemoryFirestore(); const storage = createFounderCheckoutStorage(db, {});
  for (let i = 0; i < 5; i++) await reserve(storage, { requestId: `request_token_12345${i}`, order: order(`order-${i}`) });
  assert.equal((await reserve(storage, { requestId: "request_token_123456", order: order("six") })).outcome, "rate_limited");
  assert.equal((await reserve(storage, { requestId: "request_token_123450", order: order("unused") })).order.orderId, "order-0");
  assert.equal(values(db, "paymentCheckoutRateLimits")[0].count, 5);
});

test("rolling window and injected timestamps are deterministic", async () => {
  const db = new MemoryFirestore(); const storage = createFounderCheckoutStorage(db, {});
  for (let i = 0; i < 5; i++) await reserve(storage, { requestId: `window_token_12345${i}`, order: order(`order-${i}`), timestamp: time(10) });
  const reset = await reserve(storage, { requestId: "window_token_123456", order: order("reset"), timestamp: time(3_600_010) });
  assert.equal(reset.outcome, "created"); assert.equal(values(db, "paymentCheckoutRateLimits")[0].count, 1);
  for (const timestamp of [undefined, null, -1, NaN, Infinity, new Date(-1), new Date(NaN)]) {
    await assert.rejects(storage.reserveCheckoutRequest({ requestId: "timestamp_token_1234", order: order("bad"), timestamp }), /invalid_timestamp/);
  }
});

test("transaction errors roll back all writes", async () => {
  const db = new MemoryFirestore();
  const original = db.runTransaction.bind(db);
  db.runTransaction = (callback) => original(async (tx) => {
    const originalSet = tx.set;
    tx.set = () => { throw new Error("injected_failure"); };
    return callback({ ...tx, set: tx.set, originalSet });
  });
  const storage = createFounderCheckoutStorage(db, {});
  await assert.rejects(reserve(storage), /injected_failure/);
  assert.equal(db.data.size, 0);
});
