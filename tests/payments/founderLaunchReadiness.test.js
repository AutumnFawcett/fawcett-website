import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FOUNDER_ACKNOWLEDGEMENT_VERSION, FOUNDER_RETURN_PATH, getFounderLaunchConfig, getFounderLaunchState, parsePaymentsEnabled, validateCanonicalOrigin } from "../../lib/server/founderLaunchConfig.js";

const enabled = (changes = {}) => ({ SQUARE_PAYMENTS_ENABLED: "true", SQUARE_ENVIRONMENT: "sandbox", SQUARE_ACCESS_TOKEN: "token", SQUARE_LOCATION_ID: "location", SQUARE_WEBHOOK_SIGNATURE_KEY: "signature", SQUARE_WEBHOOK_NOTIFICATION_URL: "https://example.test/webhook", FOUNDER_CANONICAL_ORIGIN: "https://www.fawcetttattoos.com", NODE_ENV: "production", ...changes });
const previewOrigin = "https://fawcett-website-git-codex-phase-f141c7-autumnfawcetts-projects.vercel.app";
const previewContext = { nodeEnv: "production", vercelEnv: "preview", vercelGitCommitRef: "codex/phase-1i-founder-sandbox-rehearsal" };

test("payment flag parsing is exact and fails closed", () => {
  assert.equal(parsePaymentsEnabled("true"), true); assert.equal(parsePaymentsEnabled("false"), false); assert.equal(parsePaymentsEnabled(undefined), false);
  for (const value of ["TRUE", "1", " true", "", null, true]) assert.throws(() => parsePaymentsEnabled(value), /founder_launch_unavailable/);
});
test("canonical redirect origin is server-owned, HTTPS, and allowlisted", () => {
  assert.equal(validateCanonicalOrigin("https://fawcetttattoos.com", { nodeEnv: "production" }), "https://fawcetttattoos.com");
  assert.equal(validateCanonicalOrigin("https://www.fawcetttattoos.com", { nodeEnv: "production" }), "https://www.fawcetttattoos.com");
  assert.equal(validateCanonicalOrigin("http://localhost:3000", { nodeEnv: "test" }), "http://localhost:3000");
  for (const value of ["http://www.fawcetttattoos.com", "https://evil.test", "https://www.fawcetttattoos.com/path", "https://user@www.fawcetttattoos.com", "https://www.fawcetttattoos.com/", "https://www.fawcetttattoos.com:443", "https://www.fawcetttattoos.com?next=/", "https://www.fawcetttattoos.com#return", " https://www.fawcetttattoos.com"]) assert.throws(() => validateCanonicalOrigin(value, { nodeEnv: "production" }));
});
test("Phase 1I Preview origin requires the exact production Preview branch context", () => {
  assert.equal(validateCanonicalOrigin(previewOrigin, previewContext), previewOrigin);
  for (const context of [
    { ...previewContext, nodeEnv: "development" },
    { ...previewContext, vercelEnv: "production" },
    { ...previewContext, vercelEnv: undefined },
    { ...previewContext, vercelGitCommitRef: "codex/another-branch" },
  ]) assert.throws(() => validateCanonicalOrigin(previewOrigin, context));
});
test("Phase 1I Preview exception rejects other deployments and hostname tricks", () => {
  for (const value of [
    "https://another-deployment.vercel.app",
    "https://fawcett-website-git-codex-phase-f141c7-autumnfawcetts-projects.vercel.app.evil.test",
    "https://evil-fawcett-website-git-codex-phase-f141c7-autumnfawcetts-projects.vercel.app",
    "https://*.vercel.app",
    `${previewOrigin}/`, `${previewOrigin}/path`, `${previewOrigin}:443`, `${previewOrigin}?next=/`, `${previewOrigin}#return`,
  ]) assert.throws(() => validateCanonicalOrigin(value, previewContext));
});
test("enabled config has a fixed return URL and invalid enabled config is unavailable", () => {
  const config = getFounderLaunchConfig({ env: enabled() });
  assert.equal(config.redirectUrl, `https://www.fawcetttattoos.com${FOUNDER_RETURN_PATH}`); assert.equal(config.acknowledgementVersion, FOUNDER_ACKNOWLEDGEMENT_VERSION);
  assert.equal(getFounderLaunchState({ env: enabled({ SQUARE_LOCATION_ID: "" }) }).state, "unavailable");
  assert.deepEqual(getFounderLaunchConfig({ env: { SQUARE_PAYMENTS_ENABLED: "false" } }), { state: "disabled", paymentsEnabled: false });
});
test("Phase 1I Preview config keeps the fixed Founder return path", () => {
  const config = getFounderLaunchConfig({ env: enabled({
    FOUNDER_CANONICAL_ORIGIN: previewOrigin,
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "codex/phase-1i-founder-sandbox-rehearsal",
  }) });
  assert.equal(config.redirectUrl, `${previewOrigin}/founders/return`);
  assert.equal(FOUNDER_RETURN_PATH, "/founders/return");
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
