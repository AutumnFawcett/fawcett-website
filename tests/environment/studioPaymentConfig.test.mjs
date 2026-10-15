import { test } from "node:test";
import assert from "node:assert/strict";
import { getStudioCheckoutConfig } from "../../lib/studioPayments/config.mjs";
test("studio checkout requires both independent switches and defaults disabled", () => {
  for (const env of [{}, { SQUARE_PAYMENTS_ENABLED: "true" }, { SQUARE_STUDIO_PAYMENTS_ENABLED: "true" }, { SQUARE_PAYMENTS_ENABLED: "false", SQUARE_STUDIO_PAYMENTS_ENABLED: "true" }]) assert.equal(getStudioCheckoutConfig({ env }).paymentsEnabled, false);
});
test("approved studio configuration reuses validated credentials and a fixed nonauthoritative return path", () => {
  const env = { SQUARE_PAYMENTS_ENABLED: "true", SQUARE_STUDIO_PAYMENTS_ENABLED: "true", SQUARE_ENVIRONMENT: "sandbox", FOUNDER_CANONICAL_ORIGIN: "http://localhost:3000", NODE_ENV: "test", SQUARE_ACCESS_TOKEN: "synthetic", SQUARE_LOCATION_ID: "synthetic", SQUARE_WEBHOOK_SIGNATURE_KEY: "synthetic", SQUARE_WEBHOOK_NOTIFICATION_URL: "https://example.test/square" };
  assert.equal(getStudioCheckoutConfig({ env }).redirectUrl, "http://localhost:3000/payments/return");
  for (const change of [{ SQUARE_ENVIRONMENT: "unexpected" }, { FOUNDER_CANONICAL_ORIGIN: "https://attacker.example.test" }, { SQUARE_ACCESS_TOKEN: "" }, { SQUARE_STUDIO_PAYMENTS_ENABLED: "yes" }]) assert.throws(() => getStudioCheckoutConfig({ env: { ...env, ...change } }));
});
