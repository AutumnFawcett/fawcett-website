import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { eventKey, normalizeSquareEvent, verifySquareSignature } from "../../lib/payments/squareWebhook.js";

const url = "https://example.test/hook", key = "signature-key";
const body = JSON.stringify({ event_id: "evt", type: "payment.updated" });
test("signatures and environment event keys are safe", () => {
  const signature = createHmac("sha256", key).update(url + body).digest("base64");
  assert.equal(verifySquareSignature({ rawBody: body, signature, signatureKey: key, notificationUrl: url }), true);
  assert.equal(verifySquareSignature({ rawBody: `${body} `, signature, signatureKey: key, notificationUrl: url }), false);
  assert.notEqual(eventKey("sandbox", "same"), eventKey("production", "same"));
});

const order = { orderId: "internal-order", provider: "square", environment: "sandbox", purpose: "founder", amountCents: 2500, currency: "CAD", providerOrderId: "square-order", status: "pending", clientUid: "client" };
function payment(overrides = {}) { return { event_id: "evt", type: "payment.updated", data: { object: { payment: { id: "pay", location_id: "loc", order_id: "square-order", amount_money: { amount: 2500, currency: "CAD" }, status: "COMPLETED", ...overrides } } } }; }

test("completed Payment Link resolves by provider order without reference_id", () => {
  const result = normalizeSquareEvent(payment(), "sandbox", "loc", null, order);
  assert.equal(result.outcome, "processed"); assert.equal(result.transaction.orderId, "internal-order");
  assert.equal(result.transaction.providerOrderId, "square-order"); assert.equal(result.paymentOrderId, "internal-order");
});
test("matching optional reference_id is accepted and mismatch rejected", () => {
  assert.equal(normalizeSquareEvent(payment({ reference_id: "internal-order" }), "sandbox", "loc", null, order).outcome, "processed");
  assert.deepEqual(normalizeSquareEvent(payment({ reference_id: "other" }), "sandbox", "loc", null, order), { outcome: "invalid", reason: "reference_id_mismatch" });
});
test("unknown provider order is ignored and missing provider order is invalid", () => {
  assert.equal(normalizeSquareEvent(payment(), "sandbox", "loc").reason, "unrecognized_provider_order_id");
  assert.equal(normalizeSquareEvent(payment({ order_id: undefined }), "sandbox", "loc").reason, "missing_provider_order_id");
});
test("trusted order, amount, currency, location, and environment must match", () => {
  assert.equal(normalizeSquareEvent(payment(), "sandbox", "other", null, order).reason, "location_mismatch");
  assert.equal(normalizeSquareEvent(payment(), "production", "loc", null, order).reason, "order_identity_mismatch");
  assert.throws(() => normalizeSquareEvent(payment({ amount_money: { amount: 1, currency: "CAD" } }), "sandbox", "loc", null, order), /amount_mismatch/);
  assert.throws(() => normalizeSquareEvent(payment({ amount_money: { amount: 2500, currency: "USD" } }), "sandbox", "loc", null, order), /invalid_currency/);
  for (const amount of ["2500", 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => normalizeSquareEvent(payment({ amount_money: { amount, currency: "CAD" } }), "sandbox", "loc", null, order), /invalid_amount/);
});
test("unrelated and non-completed POS payments are ignored", () => {
  assert.equal(normalizeSquareEvent(payment({ status: "PENDING", order_id: undefined }), "sandbox", "loc").outcome, "ignored");
});
test("refunds and disputes inherit both trusted identities", () => {
  const parent = { provider: "square", environment: "sandbox", providerLocationId: "loc", currency: "CAD", type: "charge", status: "completed", providerPaymentId: "pay", purpose: "founder", orderId: "internal-order", providerOrderId: "square-order" };
  const refund = normalizeSquareEvent({ event_id: "r", type: "refund.updated", data: { object: { refund: { id: "refund", payment_id: "pay", amount_money: { amount: 500, currency: "CAD" }, status: "COMPLETED" } } } }, "sandbox", "loc", parent);
  const dispute = normalizeSquareEvent({ event_id: "d", type: "dispute.updated", data: { object: { dispute: { id: "dispute", disputed_payment: { payment_id: "pay" }, amount_money: { amount: 2500, currency: "CAD" }, state: "LOST" } } } }, "sandbox", "loc", parent);
  for (const result of [refund, dispute]) { assert.equal(result.transaction.orderId, "internal-order"); assert.equal(result.transaction.providerOrderId, "square-order"); }
});
test("refund provider order must match the trusted parent", () => {
  const parent = { provider: "square", environment: "sandbox", providerLocationId: "loc", currency: "CAD", type: "charge", status: "completed", providerPaymentId: "pay", purpose: "founder", orderId: "internal-order", providerOrderId: "square-order" };
  const result = normalizeSquareEvent({ event_id: "r", type: "refund.updated", data: { object: { refund: { id: "refund", payment_id: "pay", order_id: "other", amount_money: { amount: 500, currency: "CAD" }, status: "COMPLETED" } } } }, "sandbox", "loc", parent);
  assert.deepEqual(result, { outcome: "invalid", reason: "refund_provider_order_mismatch" });
});
test("all non-completed charge states and unsupported events remain ignored", () => {
  for (const status of ["APPROVED", "PENDING", "CANCELED", "FAILED"]) {
    assert.deepEqual(normalizeSquareEvent(payment({ status }), "sandbox", "loc", null, order), { outcome: "ignored", reason: "payment_not_completed" });
  }
  assert.deepEqual(normalizeSquareEvent({ type: "catalog.version.updated" }, "sandbox", "loc"), { outcome: "ignored", reason: "unsupported_event" });
});
