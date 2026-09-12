import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { foundersCampaign } from "../../lib/foundersCampaign.js";
import { buildFounderCheckoutBody, validateFounderCheckoutResult } from "../../lib/payments/founderCheckoutClient.js";

const response = (ok = true) => ({ ok });

test("all fixed Founder offers produce an exact two-field payload", () => {
  const ids = foundersCampaign.rewardTiers.map(({ offerId }) => offerId);
  assert.deepEqual(ids, ["founder-10-v1", "digital-founder-25-v1", "studio-supporter-50-v1", "art-founder-100-v1", "opening-founder-250-v1"]);
  for (const offerId of ids) {
    assert.deepEqual(buildFounderCheckoutBody(offerId, "retry_token_123456", true), { offerId, requestId: "retry_token_123456", acknowledgement: { accepted: true } });
  }
});

test("successful checkout results accept only exact safe Square hosts", () => {
  for (const [environment, checkoutUrl] of [["sandbox", "https://sandbox.square.link/u/safe"], ["production", "https://square.link/u/safe"], ["production", "https://checkout.square.site/pay/safe"]]) {
    assert.equal(validateFounderCheckoutResult(response(), { orderId: "internal", checkoutUrl }, environment).checkoutUrl, checkoutUrl);
  }
  for (const checkoutUrl of [
    "http://sandbox.square.link/u/x", "https://user:pass@sandbox.square.link/u/x", "https://sandbox.square.link:443/u/x",
    "https://sandbox.square.link:8443/u/x", "https://evil.sandbox.square.link/u/x", "https://sandbox.square.link.evil.test/u/x",
    "https://connect.squareupsandbox.com/u/x", "not a url", "", " https://sandbox.square.link/u/x",
  ]) assert.throws(() => validateFounderCheckoutResult(response(), { orderId: "internal", checkoutUrl }, "sandbox"), /checkout_failed/);
  for (const checkoutUrl of ["https://square.link/u/x", "https://checkout.square.site/u/x"]) {
    assert.throws(() => validateFounderCheckoutResult(response(), { orderId: "internal", checkoutUrl }, "sandbox"), /checkout_failed/);
  }
  for (const checkoutUrl of ["https://sandbox.square.link/u/x", "https://evil.square.link/u/x", "https://square.link.evil.test/u/x", "https://checkout.square.site.evil.test/u/x"]) {
    assert.throws(() => validateFounderCheckoutResult(response(), { orderId: "internal", checkoutUrl }, "production"), /checkout_failed/);
  }
});

test("missing, unexpected, and API-error results are rejected", () => {
  for (const [res, result] of [
    [response(false), { orderId: "internal", checkoutUrl: "https://square.link/u/x" }],
    [response(), { error: "service_unavailable" }], [response(), null],
    [response(), { orderId: "internal", checkoutUrl: "https://square.link/u/x", provider: "square" }],
  ]) assert.throws(() => validateFounderCheckoutResult(res, result, "production"), /checkout_failed/);
});

test("Founder button uses validated helpers and remains launch-disabled", () => {
  const source = fs.readFileSync("components/FounderCheckoutButton.js", "utf8");
  assert.match(source, /buildFounderCheckoutBody/);
  assert.match(source, /validateFounderCheckoutResult/);
  assert.match(source, /if \(!enabled\).*Payments unavailable/);
  assert.match(source, /tattoo-portal\?returnTo=%2Ffounders/);
});

test("contribution options have a stable anchor and portal link without changing disabled payments", () => {
  const campaign = fs.readFileSync("app/founders/page.js", "utf8");
  const profile = fs.readFileSync("components/FounderProfile.js", "utf8");
  assert.match(campaign, /id="contribution-options"/);
  assert.match(profile, /href="\/founders#contribution-options"/);
  assert.match(profile, />View contribution options</);
  assert.doesNotMatch(profile, /Contribute \$15|custom contribution/i);
  assert.match(campaign, /checkoutEnabled=\{checkoutEnabled\}/);
});

test("portal keeps entitlement status separate from server-provided earned benefits", () => {
  const source = fs.readFileSync("components/FounderProfile.js", "utf8");
  assert.match(source, /Your Founder benefits/);
  assert.match(source, /p\.earnedBenefits\.map/);
  assert.match(source, /<h3>Founder details<\/h3>/);
  assert.match(source, /String\(p\.founderNumber\)\.padStart/);
  assert.match(source, /p\.recognitionMode === "public" \? "Future public recognition" : "Anonymous"/);
  assert.doesNotMatch(source, /Permanent status:<\/strong>/);
  assert.match(source, /account entitlement, separately from your earned reward tier/);
  assert.doesNotMatch(source, /founder-badge">\{p\.earnedTierName/);
});
