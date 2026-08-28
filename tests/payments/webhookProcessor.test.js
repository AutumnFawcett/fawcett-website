import test from "node:test";
import assert from "node:assert/strict";
import { processSquareWebhook } from "../../lib/payments/webhookProcessor.js";

class MemoryFirestore {
  constructor() { this.docs = new Map(); this.queue = Promise.resolve(); this.failOnce = false; }
  collection(name) { return { doc: (id) => ({ path: `${name}/${id}` }) }; }
  runTransaction(callback) {
    const run = this.queue.then(async () => {
      if (this.failOnce) { this.failOnce = false; throw new Error("temporary"); }
      const writes = [];
      const tx = {
        get: async (ref) => ({ exists: this.docs.has(ref.path), data: () => this.docs.get(ref.path) }),
        set: (ref, value) => writes.push([ref.path, value, false]),
        create: (ref, value) => writes.push([ref.path, value, true]),
      };
      const result = await callback(tx);
      for (const [path, value, create] of writes) { if (create && this.docs.has(path)) throw new Error("exists"); this.docs.set(path, value); }
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
function event(id = "evt") { return { event_id: id, type: "payment.updated", location_id: "loc", data: { object: { payment: { id: "pay", location_id: "loc", reference_id: "fawcett:founders:order:1000", amount_money: { amount: 1000, currency: "CAD" }, status: "COMPLETED" } } } }; }
const now = () => "trusted-time";
test("first delivery and exact duplicate create one logical effect", async () => {
  const firestore = new MemoryFirestore(); const value = event(); const rawBody = JSON.stringify(value);
  assert.equal((await processSquareWebhook({ firestore, environment: "sandbox", event: value, rawBody, now })).outcome, "processed");
  assert.equal((await processSquareWebhook({ firestore, environment: "sandbox", event: value, rawBody, now })).duplicate, true);
  assert.equal([...firestore.docs.keys()].filter((key) => key.startsWith("paymentTransactions/")).length, 1);
});
test("concurrent duplicates create one logical effect", async () => {
  const firestore = new MemoryFirestore(); const value = event(); const args = { firestore, environment: "sandbox", event: value, rawBody: JSON.stringify(value), now };
  await Promise.all([processSquareWebhook(args), processSquareWebhook(args)]);
  assert.equal([...firestore.docs.keys()].filter((key) => key.startsWith("paymentTransactions/")).length, 1);
});
test("same event ID with changed payload is rejected", async () => {
  const firestore = new MemoryFirestore(); const first = event(); await processSquareWebhook({ firestore, environment: "sandbox", event: first, rawBody: JSON.stringify(first), now });
  const changed = event(); changed.data.object.payment.status = "FAILED";
  assert.equal((await processSquareWebhook({ firestore, environment: "sandbox", event: changed, rawBody: JSON.stringify(changed), now })).reason, "event_id_payload_mismatch");
});
test("retryable storage failure can retry safely", async () => {
  const firestore = new MemoryFirestore(); firestore.failOnce = true; const value = event(); const args = { firestore, environment: "sandbox", event: value, rawBody: JSON.stringify(value), now };
  await assert.rejects(processSquareWebhook(args)); assert.equal((await processSquareWebhook(args)).outcome, "processed");
});
test("sandbox and production records are separate", async () => {
  const firestore = new MemoryFirestore(); const value = event(); const rawBody = JSON.stringify(value);
  await processSquareWebhook({ firestore, environment: "sandbox", event: value, rawBody, now });
  await processSquareWebhook({ firestore, environment: "production", event: value, rawBody, now });
  assert.equal([...firestore.docs.keys()].filter((key) => key.startsWith("paymentWebhookEvents/")).length, 2);
});
