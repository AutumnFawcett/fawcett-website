import test from "node:test";
import assert from "node:assert/strict";
import { processSquareWebhook } from "../../lib/payments/webhookProcessor.js";

class MemoryFirestore {
  constructor() {
    this.docs = new Map(); this.queue = Promise.resolve(); this.failOnce = false;
    this.docs.set("paymentOrders/order", { orderId: "order", provider: "square", environment: "sandbox", purpose: "founder", amountCents: 1000, currency: "CAD", providerOrderId: "square-order", status: "pending" });
    this.docs.set("paymentOrders/order-production", { orderId: "order-production", provider: "square", environment: "production", purpose: "founder", amountCents: 1000, currency: "CAD", providerOrderId: "square-order", status: "pending" });
  }
  collection(name) {
    const query = { collection: name, filters: [], where(field, op, value) { return Object.assign(Object.create(this), { filters: [...this.filters, [field, op, value]] }); }, limit(count) { return Object.assign(Object.create(this), { limitCount: count }); } };
    return Object.assign(query, { doc: (id) => ({ path: `${name}/${id}` }) });
  }
  runTransaction(callback) {
    const run = this.queue.then(async () => {
      if (this.failOnce) { this.failOnce = false; throw new Error("temporary"); }
      const writes = [];
      const tx = {
        get: async (ref) => {
          if (ref.collection) {
            const docs = [...this.docs.entries()].filter(([path, value]) => path.startsWith(`${ref.collection}/`) && ref.filters.every(([field,, expected]) => value[field] === expected)).slice(0, ref.limitCount);
            return { size: docs.length, docs: docs.map(([, value]) => ({ data: () => value })) };
          }
          return { exists: this.docs.has(ref.path), data: () => this.docs.get(ref.path) };
        },
        set: (ref, value) => writes.push([ref.path, value, false]),
        create: (ref, value) => writes.push([ref.path, value, true]),
        update: (ref, value) => writes.push([ref.path, { ...this.docs.get(ref.path), ...value }, false]),
      };
      const result = await callback(tx);
      for (const [path, value, create] of writes) { if (create && this.docs.has(path)) throw new Error("exists"); this.docs.set(path, value); }
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
function event(id = "evt") { return { event_id: id, type: "payment.updated", location_id: "loc", data: { object: { payment: { id: "pay", location_id: "loc", order_id: "square-order", reference_id: "order", amount_money: { amount: 1000, currency: "CAD" }, status: "COMPLETED" } } } }; }
const now = () => "trusted-time";
const args = (firestore, value, environment = "sandbox") => ({ firestore, environment, locationId: "loc", event: value, rawBody: JSON.stringify(value), now });
const transactions = (firestore) => [...firestore.docs.entries()].filter(([key]) => key.startsWith("paymentTransactions/"));
test("first delivery and exact duplicate create one logical effect", async () => {
  const firestore = new MemoryFirestore(); const value = event(); const rawBody = JSON.stringify(value);
  assert.equal((await processSquareWebhook({ firestore, environment: "sandbox", locationId: "loc", event: value, rawBody, now })).outcome, "processed");
  assert.equal((await processSquareWebhook({ firestore, environment: "sandbox", locationId: "loc", event: value, rawBody, now })).duplicate, true);
  assert.equal([...firestore.docs.keys()].filter((key) => key.startsWith("paymentTransactions/")).length, 1);
  assert.equal(firestore.docs.get("paymentOrders/order").status, "paid");
});

test("storage failure leaves both paid status and transaction effect unapplied", async () => {
  const firestore = new MemoryFirestore(); firestore.failOnce = true;
  await assert.rejects(processSquareWebhook(args(firestore, event("atomic"))));
  assert.equal(firestore.docs.get("paymentOrders/order").status, "pending");
  assert.equal(transactions(firestore).length, 0);
});
test("concurrent duplicates create one logical effect", async () => {
  const firestore = new MemoryFirestore(); const value = event(); const args = { firestore, environment: "sandbox", locationId: "loc", event: value, rawBody: JSON.stringify(value), now };
  await Promise.all([processSquareWebhook(args), processSquareWebhook(args)]);
  assert.equal([...firestore.docs.keys()].filter((key) => key.startsWith("paymentTransactions/")).length, 1);
});
test("same event ID with changed payload is rejected", async () => {
  const firestore = new MemoryFirestore(); const first = event(); await processSquareWebhook({ firestore, environment: "sandbox", locationId: "loc", event: first, rawBody: JSON.stringify(first), now });
  const changed = event(); changed.data.object.payment.status = "FAILED";
  assert.equal((await processSquareWebhook({ firestore, environment: "sandbox", locationId: "loc", event: changed, rawBody: JSON.stringify(changed), now })).reason, "event_id_payload_mismatch");
});
test("retryable storage failure can retry safely", async () => {
  const firestore = new MemoryFirestore(); firestore.failOnce = true; const value = event(); const args = { firestore, environment: "sandbox", locationId: "loc", event: value, rawBody: JSON.stringify(value), now };
  await assert.rejects(processSquareWebhook(args)); assert.equal((await processSquareWebhook(args)).outcome, "processed");
});
test("sandbox and production records are separate", async () => {
  const firestore = new MemoryFirestore(); const value = event(); const rawBody = JSON.stringify(value);
  await processSquareWebhook({ firestore, environment: "sandbox", locationId: "loc", event: value, rawBody, now });
  await processSquareWebhook({ firestore, environment: "production", locationId: "loc", event: value, rawBody, now });
  assert.equal([...firestore.docs.keys()].filter((key) => key.startsWith("paymentWebhookEvents/")).length, 2);
});

test("pending and approved events do not block a later completed charge", async () => {
  for (const initialStatus of ["PENDING", "APPROVED"]) {
    const firestore = new MemoryFirestore();
    const initial = event(`${initialStatus}-event`); initial.data.object.payment.status = initialStatus;
    assert.equal((await processSquareWebhook(args(firestore, initial))).outcome, "ignored");
    assert.equal(transactions(firestore).length, 0);
    const completed = event(`${initialStatus}-completed`);
    assert.equal((await processSquareWebhook(args(firestore, completed))).outcome, "processed");
    assert.equal(transactions(firestore).length, 1);
  }
});

test("failed and canceled payments never become collected funds", async () => {
  const firestore = new MemoryFirestore();
  for (const status of ["FAILED", "CANCELED"]) {
    const value = event(status); value.data.object.payment.status = status;
    assert.equal((await processSquareWebhook(args(firestore, value))).outcome, "ignored");
  }
  assert.equal(transactions(firestore).length, 0);
});

test("different completed event IDs for one payment create one charge", async () => {
  const firestore = new MemoryFirestore();
  assert.equal((await processSquareWebhook(args(firestore, event("completed-one")))).outcome, "processed");
  assert.equal((await processSquareWebhook(args(firestore, event("completed-two")))).outcome, "processed");
  assert.equal(transactions(firestore).length, 1);
});

function refundEvent(id, status, amount = 250) {
  return { event_id: id, type: "refund.updated", data: { object: { refund: { id: "refund", payment_id: "pay", amount_money: { amount, currency: "CAD" }, status } } } };
}

test("noncompleted refund states do not block one later completed refund", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("charge")));
  for (const status of ["PENDING", "FAILED", "REJECTED", "CANCELED"]) {
    assert.equal((await processSquareWebhook(args(firestore, refundEvent(`refund-${status}`, status)))).outcome, "ignored");
  }
  assert.equal(transactions(firestore).length, 1);
  assert.equal((await processSquareWebhook(args(firestore, refundEvent("refund-completed", "COMPLETED")))).outcome, "processed");
  assert.equal((await processSquareWebhook(args(firestore, refundEvent("refund-completed-again", "COMPLETED")))).outcome, "processed");
  assert.equal(transactions(firestore).length, 2);
});

test("dispute lifecycle creates at most one withheld-funds effect and WON creates no credit", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("charge")));
  const dispute = (id, state) => ({ event_id: id, type: "dispute.updated", data: { object: { dispute: { id: "dispute", state, disputed_payment: { payment_id: "pay" }, amount_money: { amount: 1000, currency: "CAD" } } } } });
  assert.equal((await processSquareWebhook(args(firestore, dispute("evidence", "EVIDENCE_REQUIRED")))).outcome, "processed");
  assert.equal((await processSquareWebhook(args(firestore, dispute("processing", "PROCESSING")))).outcome, "processed");
  assert.equal((await processSquareWebhook(args(firestore, dispute("won", "WON")))).outcome, "ignored");
  assert.equal(transactions(firestore).length, 2);
  assert.equal(firestore.docs.has("paymentTransactions/sandbox_reversal_dispute"), false);
});

test("transaction ID collision with inconsistent amount is rejected", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("first")));
  const collision = event("collision");
  collision.data.object.payment.amount_money.amount = 2000;
  collision.data.object.payment.reference_id = "order";
  assert.deepEqual(await processSquareWebhook(args(firestore, collision)), { outcome: "invalid", reason: "amount_mismatch" });
  assert.equal(firestore.docs.get("paymentTransactions/sandbox_charge_pay").amountCents, 1000);
});

test("transaction ID collision differing only in provider order ID is rejected", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("first")));
  const collision = event("collision");
  collision.data.object.payment.order_id = "different-square-order";
  assert.deepEqual(await processSquareWebhook(args(firestore, collision)), { outcome: "ignored", reason: "unrecognized_provider_order_id" });
  assert.equal(firestore.docs.get("paymentTransactions/sandbox_charge_pay").providerOrderId, "square-order");
});
