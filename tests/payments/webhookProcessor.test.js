import test from "node:test";
import assert from "node:assert/strict";
import { processSquareWebhook } from "../../lib/payments/webhookProcessor.js";

class MemoryFirestore {
  constructor() {
    this.docs = new Map(); this.queue = Promise.resolve(); this.failOnce = false;
    this.docs.set("paymentOrders/order", { orderId: "order", clientUid: "client", offerId: "founder-10-v1", offerVersion: 1, provider: "square", environment: "sandbox", purpose: "founder", amountCents: 1000, currency: "CAD", providerOrderId: "square-order", status: "pending" });
    this.docs.set("paymentOrders/order-production", { orderId: "order-production", clientUid: "client", offerId: "founder-10-v1", offerVersion: 1, provider: "square", environment: "production", purpose: "founder", amountCents: 1000, currency: "CAD", providerOrderId: "square-order", status: "pending" });
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
const profiles = (firestore) => [...firestore.docs.entries()].filter(([key]) => key.startsWith("founderProfiles/"));
const contributions = (firestore) => [...firestore.docs.entries()].filter(([key]) => key.startsWith("founderContributions/"));
function addSecondFounderPayment(firestore, id = "second") {
  firestore.docs.set("paymentOrders/order-two", { orderId: "order-two", clientUid: "client", offerId: "founder-10-v1", offerVersion: 1, provider: "square", environment: "sandbox", purpose: "founder", amountCents: 1000, currency: "CAD", providerOrderId: "square-order-two", status: "pending" });
  const value = event(id);
  Object.assign(value.data.object.payment, { id: "pay-two", order_id: "square-order-two", reference_id: "order-two" });
  return value;
}
test("first delivery and exact duplicate create one logical effect", async () => {
  const firestore = new MemoryFirestore(); const value = event(); const rawBody = JSON.stringify(value);
  assert.equal((await processSquareWebhook({ firestore, environment: "sandbox", locationId: "loc", event: value, rawBody, now })).outcome, "processed");
  assert.equal((await processSquareWebhook({ firestore, environment: "sandbox", locationId: "loc", event: value, rawBody, now })).duplicate, true);
  assert.equal([...firestore.docs.keys()].filter((key) => key.startsWith("paymentTransactions/")).length, 1);
  assert.equal(firestore.docs.get("paymentOrders/order").status, "paid");
  assert.equal(profiles(firestore).length, 1);
  assert.equal(contributions(firestore).length, 1);
  assert.equal(profiles(firestore)[0][1].founderNumber, 1);
  assert.equal(profiles(firestore)[0][1].recognitionMode, "anonymous");
});

test("completed event before provider-order linkage is retried after linkage", async () => {
  const firestore = new MemoryFirestore();
  firestore.docs.delete("paymentOrders/order");
  const value = event("linkage-race");
  const first = await processSquareWebhook(args(firestore, value));
  assert.deepEqual(first, { outcome: "ignored", reason: "unrecognized_provider_order_id" });
  assert.equal(transactions(firestore).length, 0);
  const eventRecord = [...firestore.docs.entries()].find(([path]) => path.startsWith("paymentWebhookEvents/"))[1];
  assert.equal(eventRecord.processingState, "retryable_unlinked");

  firestore.docs.set("paymentOrders/order", { orderId: "order", clientUid: "client", offerId: "founder-10-v1", offerVersion: 1, provider: "square", environment: "sandbox", purpose: "founder", amountCents: 1000, currency: "CAD", providerOrderId: "square-order", status: "pending" });
  assert.equal((await processSquareWebhook(args(firestore, value))).outcome, "processed");
  assert.equal(transactions(firestore).length, 1);
  assert.equal((await processSquareWebhook(args(firestore, value))).duplicate, true);
  assert.equal(transactions(firestore).length, 1);
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

test("sandbox and production Founder profiles and counters are isolated", async () => {
  const firestore = new MemoryFirestore();
  await processSquareWebhook(args(firestore, event("sandbox-founder")));
  const production = event("production-founder");
  production.data.object.payment.reference_id = "order-production";
  await processSquareWebhook(args(firestore, production, "production"));
  assert.equal(profiles(firestore).length, 2);
  assert.equal(firestore.docs.get("founderCounters/sandbox").nextNumber, 2);
  assert.equal(firestore.docs.get("founderCounters/production").nextNumber, 2);
  assert.deepEqual(profiles(firestore).map(([, profile]) => profile.environment).sort(), ["production", "sandbox"]);
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
  assert.equal(contributions(firestore).length, 1);
  assert.equal(profiles(firestore)[0][1].confirmedContributionCents, 1000);
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
  assert.equal(contributions(firestore).length, 2);
  assert.equal(profiles(firestore)[0][1].status, "disputed_hold");
  assert.equal(profiles(firestore)[0][1].eligibleContributionCents, 0);
});

test("repeat payments retain one number, accumulate, and upgrade at exact thresholds", async () => {
  const firestore = new MemoryFirestore();
  await processSquareWebhook(args(firestore, event("first")));
  firestore.docs.set("paymentOrders/order-two", { orderId: "order-two", clientUid: "client", offerId: "digital-founder-25-v1", offerVersion: 1, provider: "square", environment: "sandbox", purpose: "founder", amountCents: 2500, currency: "CAD", providerOrderId: "square-order-two", status: "pending" });
  const second = event("second");
  Object.assign(second.data.object.payment, { id: "pay-two", order_id: "square-order-two", reference_id: "order-two", amount_money: { amount: 2500, currency: "CAD" } });
  await processSquareWebhook(args(firestore, second));
  const profile = profiles(firestore)[0][1];
  assert.equal(profiles(firestore).length, 1);
  assert.equal(profile.founderNumber, 1);
  assert.equal(profile.confirmedContributionCents, 3500);
  assert.equal(profile.earnedTierId, "digital-founder-25-v1");
  assert.equal(contributions(firestore).length, 2);
});

test("different clients get distinct permanent numbers", async () => {
  const firestore = new MemoryFirestore();
  await processSquareWebhook(args(firestore, event("first")));
  firestore.docs.set("paymentOrders/other-order", { orderId: "other-order", clientUid: "other", offerId: "founder-10-v1", offerVersion: 1, provider: "square", environment: "sandbox", purpose: "founder", amountCents: 1000, currency: "CAD", providerOrderId: "other-square-order", status: "pending" });
  const other = event("other"); Object.assign(other.data.object.payment, { id: "other-pay", order_id: "other-square-order", reference_id: "other-order" });
  await processSquareWebhook(args(firestore, other));
  assert.deepEqual(profiles(firestore).map(([, profile]) => profile.founderNumber).sort(), [1, 2]);
});

test("partial and excessive refunds preserve history and clamp eligibility at zero", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("charge")));
  const partial = refundEvent("partial", "COMPLETED", 250); partial.data.object.refund.id = "refund-partial";
  await processSquareWebhook(args(firestore, partial));
  const excessive = refundEvent("excessive", "COMPLETED", 2000); excessive.data.object.refund.id = "refund-excessive";
  await processSquareWebhook(args(firestore, excessive));
  const profile = profiles(firestore)[0][1];
  assert.equal(profile.refundedContributionCents, 2250);
  assert.equal(profile.eligibleContributionCents, 0);
  assert.equal(profile.founderNumber, 1);
  assert.equal(profile.earnedTierId, null);
  assert.equal(contributions(firestore).length, 3);
});

test("Founder validation failure rolls back every webhook financial and entitlement write", async () => {
  const firestore = new MemoryFirestore();
  firestore.docs.get("paymentOrders/order").offerVersion = 99;
  await assert.rejects(processSquareWebhook(args(firestore, event("bad-offer"))), /founder_entitlement_offer_mismatch/);
  assert.equal(firestore.docs.get("paymentOrders/order").status, "pending");
  assert.equal(transactions(firestore).length, 0);
  assert.equal(profiles(firestore).length, 0);
  assert.equal(contributions(firestore).length, 0);
  assert.equal([...firestore.docs.keys()].filter((key) => key.startsWith("paymentWebhookEvents/")).length, 0);
});

test("later contributions preserve a valid public recognition preference", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("first")));
  const profile = profiles(firestore)[0][1];
  profile.recognitionMode = "public"; profile.publicRecognitionEnabled = true;
  await processSquareWebhook(args(firestore, addSecondFounderPayment(firestore, "public-later")));
  const updated = profiles(firestore)[0][1];
  assert.equal(updated.recognitionMode, "public");
  assert.equal(updated.publicRecognitionEnabled, true);
  assert.equal(updated.confirmedContributionCents, 2000);
});

test("unknown or inconsistent recognition preferences fail closed", async () => {
  for (const [recognitionMode, publicRecognitionEnabled] of [["anonymous", true], ["public", false], ["unknown", false]]) {
    const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("first")));
    const profile = profiles(firestore)[0][1];
    Object.assign(profile, { recognitionMode, publicRecognitionEnabled });
    await assert.rejects(processSquareWebhook(args(firestore, addSecondFounderPayment(firestore, `invalid-${recognitionMode}-${publicRecognitionEnabled}`))), /founder_profile_collision/);
    assert.equal(profile.confirmedContributionCents, 1000);
    assert.equal(contributions(firestore).length, 1);
  }
});

test("calculated Founder aggregate overflow fails closed", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("first")));
  const profile = profiles(firestore)[0][1];
  profile.confirmedContributionCents = Number.MAX_SAFE_INTEGER;
  profile.eligibleContributionCents = Number.MAX_SAFE_INTEGER;
  await assert.rejects(processSquareWebhook(args(firestore, addSecondFounderPayment(firestore, "overflow"))), /founder_aggregate_overflow/);
  assert.equal(profile.confirmedContributionCents, Number.MAX_SAFE_INTEGER);
  assert.equal(contributions(firestore).length, 1);
});

test("duplicate contribution fails closed when its linked profile is missing", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("first")));
  firestore.docs.delete(profiles(firestore)[0][0]);
  await assert.rejects(processSquareWebhook(args(firestore, event("same-payment-new-event"))), /founder_profile_missing_for_contribution/);
  assert.equal(contributions(firestore).length, 1);
});

test("duplicate contribution fails closed when its linked profile is inconsistent", async () => {
  const firestore = new MemoryFirestore(); await processSquareWebhook(args(firestore, event("first")));
  profiles(firestore)[0][1].clientUid = "other";
  await assert.rejects(processSquareWebhook(args(firestore, event("same-payment-inconsistent-profile"))), /founder_profile_collision/);
  assert.equal(contributions(firestore).length, 1);
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
  firestore.docs.get("paymentTransactions/sandbox_charge_pay").providerOrderId = "tampered-provider-order";
  const collision = event("collision");
  assert.deepEqual(await processSquareWebhook(args(firestore, collision)), { outcome: "invalid", reason: "transaction_identity_collision" });
  assert.equal(firestore.docs.get("paymentTransactions/sandbox_charge_pay").providerOrderId, "tampered-provider-order");
});
