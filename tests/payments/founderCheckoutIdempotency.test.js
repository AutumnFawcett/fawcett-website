import test from "node:test";
import assert from "node:assert/strict";
import { createIdempotentFounderCheckout } from "../../lib/payments/checkoutService.js";

function setup() {
  let reservation; let providers = 0;
  const storage = {
    async reserveCheckoutRequest({ requestId, order }) { if (!reservation) reservation = { requestId, order }; else if (reservation.requestId !== requestId || reservation.order.clientUid !== order.clientUid || reservation.order.offerId !== order.offerId) return { outcome: "conflict" }; return { outcome: reservation.order === order ? "created" : "existing", order: reservation.order }; },
    async attachProviderIdentity(id, identity) { Object.assign(reservation.order, identity, { status: "pending" }); }, async markCreationFailed() {},
  };
  const provider = { async createPaymentLink() { providers++; return { paymentLink: { id: "link", url: "https://square.link/u/idempotent" }, order: { id: "sq-order", totalMoney: { amount: 1000n, currency: "CAD" } } }; } };
  return { storage, provider, config: { paymentsEnabled: true, environment: "sandbox", locationId: "loc" }, get providers() { return providers; } };
}
const run = (s, values = {}) => createIdempotentFounderCheckout({ input: { offerId: values.offerId || "founder-10-v1" }, requestId: "retry_token_123456", clientUid: values.uid || "uid", ...s, createId: values.createId || (() => "order-one"), now: () => new Date(0) });
test("sequential retry returns durable result without another provider link", async () => { const s = setup(); const a = await run(s); const b = await run(s, { createId: () => "unused" }); assert.equal(a.orderId, b.orderId); assert.equal(s.providers, 1); });
test("retry token cannot change user or offer", async () => { const s = setup(); await run(s); await assert.rejects(run(s, { uid: "other" }), /checkout_request_conflict/); await assert.rejects(run(s, { offerId: "digital-founder-25-v1" }), /checkout_request_conflict/); });
test("ambiguous retry retains the original order and Square idempotency key", async () => { const s = setup(); const keys = []; s.provider.createPaymentLink = async ({ order }) => { keys.push(order.idempotencyKey); throw new Error("timeout"); }; await assert.rejects(run(s), /checkout_outcome_unknown/); await assert.rejects(run(s, { createId: () => "unused" }), /checkout_outcome_unknown/); assert.deepEqual(keys, ["fawcett-order-one", "fawcett-order-one"]); });
