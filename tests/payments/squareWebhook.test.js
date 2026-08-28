import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { eventKey, normalizeSquareEvent, verifySquareSignature } from "../../lib/payments/squareWebhook.js";

const url = "https://example.test/api/payments/webhooks/square";
const key = "sandbox-signature-key";
const body = JSON.stringify({ event_id: "evt-1", type: "payment.updated" });
const signature = createHmac("sha256", key).update(url + body).digest("base64");

test("valid sandbox signature is accepted", () => assert.equal(verifySquareSignature({ rawBody: body, signature, signatureKey: key, notificationUrl: url }), true));
test("missing and invalid signatures are rejected", () => {
  assert.equal(verifySquareSignature({ rawBody: body, signature: "", signatureKey: key, notificationUrl: url }), false);
  assert.equal(verifySquareSignature({ rawBody: body, signature: "bad", signatureKey: key, notificationUrl: url }), false);
});
test("modified body and incorrect notification URL are rejected", () => {
  assert.equal(verifySquareSignature({ rawBody: body + " ", signature, signatureKey: key, notificationUrl: url }), false);
  assert.equal(verifySquareSignature({ rawBody: body, signature, signatureKey: key, notificationUrl: url + "/" }), false);
});
test("environment keys cannot collide", () => assert.notEqual(eventKey("sandbox", "same"), eventKey("production", "same")));

function paymentEvent(overrides = {}) {
  return { event_id: "evt", type: "payment.updated", location_id: "loc", data: { object: { payment: { id: "pay", location_id: "loc", order_id: "square-order-456", reference_id: "fawcett:founders:fawcett-order-123:2500:enrollment:user", amount_money: { amount: 2500, currency: "CAD" }, status: "COMPLETED", ...overrides } } } };
}
test("supported linked payment creates a CAD cents transaction", () => {
  const result = normalizeSquareEvent(paymentEvent(), "sandbox", "loc");
  assert.equal(result.outcome, "processed"); assert.equal(result.transaction.amountCents, 2500); assert.equal(result.transaction.purpose, "founders");
  assert.equal(result.transaction.orderId, "fawcett-order-123"); assert.equal(result.transaction.providerOrderId, "square-order-456");
});
test("completed payment without a Square order ID is rejected safely", () => {
  assert.deepEqual(normalizeSquareEvent(paymentEvent({ order_id: undefined }), "sandbox", "loc"), { outcome: "invalid", reason: "missing_provider_order_id" });
});
test("unlinked POS payments are ignored", () => assert.equal(normalizeSquareEvent(paymentEvent({ reference_id: undefined }), "sandbox", "loc").outcome, "ignored"));
test("amount and currency mismatches are rejected", () => {
  assert.throws(() => normalizeSquareEvent(paymentEvent({ amount_money: { amount: 2499, currency: "CAD" } }), "sandbox", "loc"), /amount_mismatch/);
  assert.throws(() => normalizeSquareEvent(paymentEvent({ amount_money: { amount: 1, currency: "USD" } }), "sandbox", "loc"), /invalid_currency/);
});
test("Money amounts must be non-negative safe integers without coercion", () => {
  for (const amount of ["1000", 1.5, null, -1]) {
    assert.throws(() => normalizeSquareEvent(paymentEvent({ amount_money: { amount, currency: "CAD" } }), "sandbox", "loc"), /invalid_amount/);
  }
});
test("refunds and chargebacks inherit both order identities", () => {
  const parent = { provider: "square", environment: "sandbox", providerLocationId: "loc", currency: "CAD", type: "charge", status: "completed", providerPaymentId: "pay", purpose: "founders", orderId: "fawcett-order-123", providerOrderId: "square-order-456" };
  const refund = normalizeSquareEvent({ event_id: "r", type: "refund.updated", data: { object: { refund: { id: "refund", payment_id: "pay", amount_money: { amount: 500, currency: "CAD" }, status: "COMPLETED" } } } }, "sandbox", "loc", parent);
  const dispute = normalizeSquareEvent({ event_id: "d", type: "dispute.updated", data: { object: { dispute: { id: "dispute", disputed_payment: { payment_id: "pay" }, amount_money: { amount: 2500, currency: "CAD" }, state: "LOST" } } } }, "sandbox", "loc", parent);
  assert.equal(refund.transaction.type, "refund"); assert.equal(refund.transaction.parentTransactionId, "sandbox_charge_pay");
  assert.equal(refund.transaction.orderId, "fawcett-order-123"); assert.equal(refund.transaction.providerOrderId, "square-order-456");
  assert.equal(dispute.transaction.type, "chargeback"); assert.equal(dispute.transaction.parentTransactionId, "sandbox_charge_pay");
  assert.equal(dispute.transaction.orderId, "fawcett-order-123"); assert.equal(dispute.transaction.providerOrderId, "square-order-456");
});
test("refund Square order ID must match its trusted parent", () => {
  const parent = { provider: "square", environment: "sandbox", providerLocationId: "loc", currency: "CAD", type: "charge", status: "completed", providerPaymentId: "pay", purpose: "founders", orderId: "fawcett-order-123", providerOrderId: "square-order-456" };
  const result = normalizeSquareEvent({ event_id: "r", type: "refund.updated", data: { object: { refund: { id: "refund", payment_id: "pay", order_id: "another-square-order", amount_money: { amount: 500, currency: "CAD" }, status: "COMPLETED" } } } }, "sandbox", "loc", parent);
  assert.deepEqual(result, { outcome: "invalid", reason: "refund_provider_order_mismatch" });
});
test("unknown events are ignored", () => assert.equal(normalizeSquareEvent({ type: "catalog.version.updated" }, "sandbox", "loc").outcome, "ignored"));

test("only completed charges are authoritative", () => {
  for (const status of ["APPROVED", "PENDING", "CANCELED", "FAILED"]) {
    assert.deepEqual(normalizeSquareEvent(paymentEvent({ status }), "sandbox", "loc"), { outcome: "ignored", reason: "payment_not_completed" });
  }
});

test("configured location, not event location, is authoritative", () => {
  assert.equal(normalizeSquareEvent(paymentEvent({ location_id: "other" }), "sandbox", "loc").reason, "location_mismatch");
  assert.equal(normalizeSquareEvent(paymentEvent(), "sandbox", "loc").outcome, "processed");
});
