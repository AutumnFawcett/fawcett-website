import test from "node:test";
import assert from "node:assert/strict";
import { createFounderCheckout, reconcileFounderCheckout } from "../../lib/payments/checkoutService.js";
import { assertMoney, FOUNDER_OFFERS } from "../../lib/payments/founderOffers.js";
import { validatePaymentLinkResponse } from "../../lib/payments/paymentLinkValidation.js";
import { canAttachProviderIdentity } from "../../lib/payments/paymentOrderState.js";
import { squarePaymentLinkRequest } from "../../lib/payments/squarePaymentLinkRequest.js";
import { assertSquareCheckoutConfig } from "../../lib/payments/squareCheckoutConfig.js";

function setup(response = { paymentLink: { id: "link-id", url: "https://square.link/u/test" }, order: { id: "square-order", totalMoney: { amount: 1000n, currency: "CAD" } } }) {
  const calls = []; let saved;
  return { calls, get saved() { return saved; }, config: { paymentsEnabled: true, environment: "sandbox", locationId: "loc" }, provider: { async createPaymentLink(value) { calls.push(["provider", value]); return response; } }, storage: {
    async getOrder() { return saved; },
    async createOrder(value) { calls.push(["create", value]); saved = value; },
    async attachProviderIdentity(id, identity) { calls.push(["attach", id, identity]); Object.assign(saved, identity, { status: "pending" }); },
    async markCreationFailed(id, code) { calls.push(["failed", id, code]); saved.status = "creation_failed"; saved.failureCode = code; },
  } };
}
const run = (s, input = { offerId: "founder-10-v1" }) => createFounderCheckout({ input, clientUid: "uid", ...s, createId: () => "internal123", now: () => "now" });

test("disabled flag fails closed before storage and provider", async () => { const s = setup(); s.config.paymentsEnabled = false; await assert.rejects(run(s), /payments_disabled/); assert.equal(s.calls.length, 0); });
test("checkout configuration fails closed before storage and provider", async () => {
  for (const config of [
    { paymentsEnabled: true, locationId: "loc" },
    { paymentsEnabled: true, environment: "development", locationId: "loc" },
    { paymentsEnabled: true, environment: "sandbox" },
    { paymentsEnabled: true, environment: "sandbox", locationId: "   " },
  ]) {
    const s = setup(); s.config = config;
    await assert.rejects(run(s), /invalid_square_environment|missing_square_location/);
    assert.equal(s.calls.length, 0);
  }
});
test("unknown offers and browser-controlled commercial fields are rejected", async () => { const s = setup(); await assert.rejects(run(s, { offerId: "custom" }), /unknown_offer/); await assert.rejects(run(s, { offerId: "founder-10-v1", amountCents: 1 }), /untrusted_checkout_field/); assert.equal(s.calls.length, 0); });
test("catalogue has fixed CAD safe-integer amounts", () => { assert.deepEqual(Object.values(FOUNDER_OFFERS).map((x) => x.amountCents), [1000, 2500, 5000, 10000, 25000]); for (const x of Object.values(FOUNDER_OFFERS)) assert.doesNotThrow(() => assertMoney(x.amountCents, x.currency)); });
test("Money validation never coerces malformed values", () => { for (const x of ["1", -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => assertMoney(x), /invalid_amount/); assert.throws(() => assertMoney(1, "USD"), /invalid_currency/); });
test("server ID, reference, and idempotency are stable and identities remain distinct", async () => { const s = setup(); const result = await run(s); assert.equal(s.saved.orderId, "internal123"); assert.ok(s.saved.orderId.length <= 40); assert.equal(s.saved.idempotencyKey, "fawcett-internal123"); assert.equal(s.calls[1][1].order.idempotencyKey, s.saved.idempotencyKey); assert.equal(result.providerOrderId, "square-order"); assert.notEqual(result.orderId, result.providerOrderId); });
test("provider response validation is strict", () => {
  const order = { amountCents: 1000 }; const valid = { paymentLink: { id: "link", url: "https://checkout.square.site/test" }, order: { id: "sq", totalMoney: { amount: 1000, currency: "CAD" } } };
  assert.doesNotThrow(() => validatePaymentLinkResponse(valid, order));
  for (const [change, message] of [
    [(x) => { x.paymentLink.id = ""; }, "invalid_payment_link_id"], [(x) => { delete x.order.id; }, "missing_provider_order_id"],
    [(x) => { x.paymentLink.url = "http://square.link/test"; }, "invalid_checkout_url"], [(x) => { x.paymentLink.url = "https://evil.test"; }, "invalid_checkout_host"],
    [(x) => { x.order.totalMoney.amount = 999; }, "provider_amount_mismatch"], [(x) => { x.order.totalMoney.currency = "USD"; }, "invalid_currency"],
  ]) { const value = structuredClone(valid); change(value); assert.throws(() => validatePaymentLinkResponse(value, order), new RegExp(message)); }
});
test("provider failure stores only a safe failure code", async () => { const s = setup(); s.provider.createPaymentLink = async () => { throw new Error("token-secret raw provider response"); }; await assert.rejects(run(s), /checkout_creation_failed/); assert.equal(s.saved.status, "creation_failed"); assert.equal(s.saved.failureCode, "provider_creation_failed"); assert.equal(JSON.stringify(s.saved).includes("token-secret"), false); });
test("invalid provider response uses a distinct safe failure code", async () => {
  const s = setup({ paymentLink: { id: "", url: "provider-secret" } });
  await assert.rejects(run(s), /checkout_response_invalid/);
  assert.equal(s.saved.status, "creation_failed");
  assert.equal(s.saved.failureCode, "provider_response_invalid");
  assert.equal(JSON.stringify(s.saved).includes("provider-secret"), false);
});
test("successful provider call followed by persistence failure remains recoverable", async () => {
  const s = setup();
  s.storage.attachProviderIdentity = async (orderId, identity) => {
    s.calls.push(["attach-failed", orderId, identity]);
    throw new Error("firestore details");
  };
  let error;
  try { await run(s); } catch (caught) { error = caught; }
  assert.equal(error.message, "checkout_persistence_pending");
  assert.equal(error.orderId, "internal123");
  assert.equal(error.idempotencyKey, "fawcett-internal123");
  assert.equal("checkoutUrl" in error, false);
  assert.equal(s.saved.status, "creating");
  assert.equal(s.saved.failureCode, null);
  assert.equal(s.calls.some(([name]) => name === "failed"), false);
  assert.equal(s.calls[1][1].order.orderId, error.orderId);
  assert.equal(s.calls[1][1].order.idempotencyKey, error.idempotencyKey);

  s.storage.attachProviderIdentity = async (orderId, identity) => {
    s.calls.push(["attach-retry", orderId, identity]);
    Object.assign(s.saved, identity, { status: "pending" });
  };
  const recovered = await reconcileFounderCheckout({ orderId: error.orderId, config: s.config, storage: s.storage, provider: s.provider, now: () => "retry-now" });
  assert.equal(recovered.orderId, "internal123");
  assert.equal(recovered.idempotencyKey, "fawcett-internal123");
  assert.equal(recovered.checkoutUrl, "https://square.link/u/test");
  const providerCalls = s.calls.filter(([name]) => name === "provider");
  assert.equal(providerCalls.length, 2);
  assert.equal(providerCalls[1][1].order.orderId, providerCalls[0][1].order.orderId);
  assert.equal(providerCalls[1][1].order.idempotencyKey, providerCalls[0][1].order.idempotencyKey);
});
test("only a pristine creating order can attach a provider identity", () => {
  const pristine = { status: "creating", providerOrderId: null, providerPaymentLinkId: null, checkoutUrl: null };
  assert.equal(canAttachProviderIdentity(pristine), true);
  for (const change of [{ status: "pending" }, { providerOrderId: "other" }, { providerPaymentLinkId: "other" }, { checkoutUrl: "https://square.link/u/other" }]) {
    assert.equal(canAttachProviderIdentity({ ...pristine, ...change }), false);
  }
});
test("Square request derives every commercial value from the trusted order and offer", () => {
  const request = squarePaymentLinkRequest({
    order: { orderId: "internal", idempotencyKey: "stable-key", amountCents: 2500 },
    offer: { itemName: "Digital Founder" }, locationId: "configured-location",
  });
  assert.deepEqual(request, { idempotencyKey: "stable-key", order: { locationId: "configured-location", referenceId: "internal", lineItems: [{ name: "Digital Founder", quantity: "1", basePriceMoney: { amount: 2500n, currency: "CAD" } }] } });
});
test("adapter configuration accepts only explicit environments and a nonblank location", () => {
  for (const environment of ["sandbox", "production"]) assert.doesNotThrow(() => assertSquareCheckoutConfig({ environment, locationId: "loc" }));
  for (const config of [{ locationId: "loc" }, { environment: "test", locationId: "loc" }, { environment: "sandbox", locationId: "" }]) {
    assert.throws(() => assertSquareCheckoutConfig(config));
  }
});
