import test from "node:test";
import assert from "node:assert/strict";
import { handleSquareWebhookRequest } from "../../lib/payments/squareWebhookRoute.js";

function dependencies(overrides = {}) {
  const entries = [];
  return {
    entries,
    value: {
      getConfig: () => ({ environment: "sandbox" }),
      getFirebaseAdmin: () => ({ firestore: {} }),
      handleWebhook: async () => ({ status: 200, body: { outcome: "processed" } }),
      now: () => "timestamp",
      logger: { error: (entry) => entries.push(entry) },
      ...overrides,
    },
  };
}

test("configuration failures log only safe diagnostics and preserve the response", async () => {
  const secret = "configuration-private-value";
  process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = secret;
  const deps = dependencies({
    getConfig: () => { const error = new Error(`invalid signature key=${secret}`); error.name = "ConfigError"; error.code = "SQUARE_CONFIG"; throw error; },
  });

  const result = await handleSquareWebhookRequest(new Request("https://example.test/hook"), deps.value);

  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { outcome: "retryable", reason: "server_configuration_unavailable" });
  assert.deepEqual(deps.entries, [{ stage: "configuration", name: "ConfigError", code: "SQUARE_CONFIG", message: "invalid [redacted]" }]);
  assert.equal(JSON.stringify(deps.entries).includes(secret), false);
  delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
});

test("processing failures log only safe diagnostics and preserve the response", async () => {
  const deps = dependencies({
    handleWebhook: async () => { const error = new Error("database temporarily unavailable"); error.name = "FirestoreError"; error.code = "unavailable"; throw error; },
  });
  const request = new Request("https://example.test/hook", { method: "POST", headers: { authorization: "Bearer request-token" }, body: JSON.stringify({ customer: "private-customer" }) });

  const result = await handleSquareWebhookRequest(request, deps.value);

  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { outcome: "retryable", reason: "processing_unavailable" });
  assert.deepEqual(deps.entries, [{ stage: "processing", name: "FirestoreError", code: "unavailable", message: "database temporarily unavailable" }]);
  assert.equal(JSON.stringify(deps.entries).includes("request-token"), false);
  assert.equal(JSON.stringify(deps.entries).includes("private-customer"), false);
});
