import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FOUNDER_ACKNOWLEDGEMENT_VERSION, FOUNDER_RETURN_PATH, getFounderLaunchConfig, getFounderLaunchState, parsePaymentsEnabled, validateCanonicalOrigin } from "../../lib/server/founderLaunchConfig.js";

const enabled = (changes = {}) => ({ SQUARE_PAYMENTS_ENABLED: "true", SQUARE_ENVIRONMENT: "sandbox", SQUARE_ACCESS_TOKEN: "token", SQUARE_LOCATION_ID: "location", SQUARE_WEBHOOK_SIGNATURE_KEY: "signature", SQUARE_WEBHOOK_NOTIFICATION_URL: "https://example.test/webhook", FOUNDER_CANONICAL_ORIGIN: "https://www.fawcetttattoos.com", NODE_ENV: "production", ...changes });

test("payment flag parsing is exact and fails closed", () => {
  assert.equal(parsePaymentsEnabled("true"), true); assert.equal(parsePaymentsEnabled("false"), false); assert.equal(parsePaymentsEnabled(undefined), false);
  for (const value of ["TRUE", "1", " true", "", null, true]) assert.throws(() => parsePaymentsEnabled(value), /founder_launch_unavailable/);
});
test("canonical redirect origin is server-owned, HTTPS, and allowlisted", () => {
  assert.equal(validateCanonicalOrigin("https://www.fawcetttattoos.com", { nodeEnv: "production" }), "https://www.fawcetttattoos.com");
  assert.equal(validateCanonicalOrigin("http://localhost:3000", { nodeEnv: "test" }), "http://localhost:3000");
  for (const value of ["http://www.fawcetttattoos.com", "https://evil.test", "https://www.fawcetttattoos.com/path", "https://user@www.fawcetttattoos.com", "https://www.fawcetttattoos.com/"]) assert.throws(() => validateCanonicalOrigin(value, { nodeEnv: "production" }));
});
test("enabled config has a fixed return URL and invalid enabled config is unavailable", () => {
  const config = getFounderLaunchConfig({ env: enabled() });
  assert.equal(config.redirectUrl, `https://www.fawcetttattoos.com${FOUNDER_RETURN_PATH}`); assert.equal(config.acknowledgementVersion, FOUNDER_ACKNOWLEDGEMENT_VERSION);
  assert.equal(getFounderLaunchState({ env: enabled({ SQUARE_LOCATION_ID: "" }) }).state, "unavailable");
  assert.deepEqual(getFounderLaunchConfig({ env: { SQUARE_PAYMENTS_ENABLED: "false" } }), { state: "disabled", paymentsEnabled: false });
});
test("return page never treats redirect arrival as confirmation", () => {
  const source = fs.readFileSync("app/founders/return/page.js", "utf8");
  assert.match(source, /does not confirm payment or grant Founder status/); assert.match(source, /after Square confirms/); assert.doesNotMatch(source, /searchParams|paymentId|orderId|clientUid/);
});
test("Founder campaign copy follows disabled, enabled, and invalid launch states without losing progress", () => {
  const source = fs.readFileSync("app/founders/page.js", "utf8");
  assert.match(source, /Payments are not currently being accepted/); assert.match(source, /Checkout is securely completed through Square/);
  assert.match(source, /Founder checkout is unavailable/); assert.match(source, /<ProgressMeter/); assert.match(source, /launch\.state === "enabled"/);
});
