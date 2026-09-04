import test from "node:test";
import assert from "node:assert/strict";
import { handleFounderCheckoutRequest } from "../../lib/payments/founderCheckoutApi.js";

const validBody = { offerId: "founder-10-v1", requestId: "retry_token_123456" };
function request(body = validBody, headers = {}) {
  return new Request("https://example.test/api/payments/checkout/founder", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer token", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
function dependencies(overrides = {}) {
  const calls = [];
  return { calls, value: {
    authenticate: async () => "verified-uid",
    getConfig: () => ({ paymentsEnabled: true }),
    getCheckoutDependencies: async () => { calls.push("dependencies"); return {}; },
    checkout: async (values) => { calls.push(values); return { orderId: "internal", checkoutUrl: "https://square.link/u/safe", providerOrderId: "not-returned" }; },
    ...overrides,
  } };
}

test("checkout API authenticates and returns only safe no-store fields", async () => {
  const deps = dependencies(); const response = await handleFounderCheckoutRequest(request(), deps.value);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { orderId: "internal", checkoutUrl: "https://square.link/u/safe" });
  assert.equal(deps.calls[1].clientUid, "verified-uid");
});
test("disabled checkout stops before storage/provider dependencies", async () => {
  const deps = dependencies({ getConfig: () => ({ paymentsEnabled: false }) });
  const response = await handleFounderCheckoutRequest(request(), deps.value);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: "payments_disabled" }); assert.deepEqual(deps.calls, []);
});
test("content type, malformed JSON, offers, and unexpected fields fail safely", async () => {
  for (const [req, expected] of [[request(validBody, { "content-type": "text/plain" }), 415], [request("{"), 400], [request({ ...validBody, clientUid: "attacker" }), 400], [request({ ...validBody, amount: 1 }), 400]]) {
    const deps = dependencies(); const response = await handleFounderCheckoutRequest(req, deps.value); assert.equal(response.status, expected); assert.deepEqual(deps.calls, []);
  }
  const deps = dependencies({ checkout: async () => { throw new Error("unknown_offer"); } });
  assert.equal((await handleFounderCheckoutRequest(request({ ...validBody, offerId: "unknown" }), deps.value)).status, 400);
});
test("authentication errors never expose tokens or verifier details", async () => {
  const deps = dependencies({ authenticate: async () => { throw new Error("token secret firebase detail"); } });
  const response = await handleFounderCheckoutRequest(request(), deps.value); assert.equal(response.status, 401);
  assert.equal(JSON.stringify(await response.json()).includes("secret"), false); assert.deepEqual(deps.calls, []);
});
test("ambiguous and persistence-pending outcomes never return URLs", async () => {
  for (const [message, code] of [["checkout_outcome_unknown", "provider_outcome_unknown"], ["checkout_persistence_pending", "reconciliation_pending"]]) {
    const deps = dependencies({ checkout: async () => { throw new Error(message); } });
    const response = await handleFounderCheckoutRequest(request(), deps.value); assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: code });
  }
});
test("stored inconsistency receives a stable no-store internal error", async () => {
  const deps = dependencies({ checkout: async () => { throw new Error("checkout_request_inconsistent: secret/path"); } });
  const response = await handleFounderCheckoutRequest(request(), deps.value);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "service_unavailable" });

  deps.value.checkout = async () => { throw new Error("checkout_request_inconsistent"); };
  const mapped = await handleFounderCheckoutRequest(request(), deps.value);
  assert.equal(mapped.status, 500); assert.equal(mapped.headers.get("cache-control"), "no-store");
  assert.deepEqual(await mapped.json(), { error: "internal_inconsistency" });
});
