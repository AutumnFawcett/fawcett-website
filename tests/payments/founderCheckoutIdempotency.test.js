import test from "node:test";
import assert from "node:assert/strict";
import { createIdempotentFounderCheckout } from "../../lib/payments/checkoutService.js";

function setup() {
  let reservation; let providers = 0;
  const storage = {
    async reserveCheckoutRequest({ requestId, order }) {
      if (!reservation) reservation = { requestId, order, mapping: { requestId, orderId: order.orderId, clientUid: order.clientUid, offerId: order.offerId, provider: order.provider, environment: order.environment, createdAt: order.createdAt } };
      else if (reservation.requestId !== requestId || reservation.order.clientUid !== order.clientUid || reservation.order.offerId !== order.offerId) return { outcome: "conflict" };
      return { outcome: reservation.order === order ? "created" : "existing", mapping: reservation.mapping, order: reservation.order };
    },
    async attachProviderIdentity(id, identity) { Object.assign(reservation.order, identity, { status: "pending" }); }, async markCreationFailed() {},
  };
  const provider = { async createPaymentLink() { providers++; return { paymentLink: { id: "link", url: "https://square.link/u/idempotent" }, order: { id: "sq-order", totalMoney: { amount: 1000n, currency: "CAD" } } }; } };
  return { storage, provider, config: { paymentsEnabled: true, environment: "sandbox", locationId: "loc" }, get providers() { return providers; }, get reservation() { return reservation; } };
}
const run = (s, values = {}) => createIdempotentFounderCheckout({ input: { offerId: values.offerId || "founder-10-v1" }, requestId: "retry_token_123456", clientUid: values.uid || "uid", ...s, createId: values.createId || (() => "order-one"), now: () => new Date(0) });
test("sequential retry returns durable result without another provider link", async () => { const s = setup(); const a = await run(s); const b = await run(s, { createId: () => "unused" }); assert.equal(a.orderId, b.orderId); assert.equal(s.providers, 1); });
test("retry token cannot change user or offer", async () => { const s = setup(); await run(s); await assert.rejects(run(s, { uid: "other" }), /checkout_request_conflict/); await assert.rejects(run(s, { offerId: "digital-founder-25-v1" }), /checkout_request_conflict/); });
test("ambiguous retry retains the original order and Square idempotency key", async () => { const s = setup(); const keys = []; s.provider.createPaymentLink = async ({ order }) => { keys.push(order.idempotencyKey); throw new Error("timeout"); }; await assert.rejects(run(s), /checkout_outcome_unknown/); await assert.rejects(run(s, { createId: () => "unused" }), /checkout_outcome_unknown/); assert.deepEqual(keys, ["fawcett-order-one", "fawcett-order-one"]); });
test("every reused reservation is strictly validated before provider invocation or return", async () => {
  const corruptions = [
    (x) => { x.mapping.orderId = "other"; }, (x) => { x.mapping.clientUid = "other"; },
    (x) => { x.mapping.offerId = "digital-founder-25-v1"; }, (x) => { x.order.clientUid = "other"; },
    (x) => { x.order.purpose = "other"; }, (x) => { x.order.provider = "other"; },
    (x) => { x.order.environment = "production"; }, (x) => { x.order.offerId = "digital-founder-25-v1"; },
    (x) => { x.order.amountCents = 1; }, (x) => { x.order.currency = "USD"; },
    (x) => { x.order.itemName = "Changed"; }, (x) => { x.order.offerVersion = 2; },
    (x) => { x.order.idempotencyKey = "wrong"; }, (x) => { x.order.status = "paid"; },
    (x) => { x.order.createdAt = new Date(-1); }, (x) => { x.order.updatedAt = new Date(-1); },
  ];
  for (const corrupt of corruptions) {
    const s = setup(); await run(s); corrupt(s.reservation);
    await assert.rejects(run(s, { createId: () => "unused" }), /checkout_request_(?:inconsistent|conflict)/);
    assert.equal(s.providers, 1);
  }
});
test("pending retries reject unsafe stored URLs and inconsistent status fields", async () => {
  for (const checkoutUrl of ["http://square.link/x", "https://user@square.link/x", "https://square.link:443/x", "https://evil.square.link/x"]) {
    const s = setup(); await run(s); s.reservation.order.checkoutUrl = checkoutUrl;
    await assert.rejects(run(s, { createId: () => "unused" }), /checkout_request_inconsistent/);
    assert.equal(s.providers, 1);
  }
});
test("service boundary rejects malformed request IDs before durable work", async () => {
  for (const requestId of [undefined, "short", "x".repeat(65), "invalid request id!"]) {
    const s = setup();
    await assert.rejects(createIdempotentFounderCheckout({ input: { offerId: "founder-10-v1" }, requestId, clientUid: "uid", ...s }), /invalid_request_id/);
    assert.equal(s.reservation, undefined); assert.equal(s.providers, 0);
  }
});
