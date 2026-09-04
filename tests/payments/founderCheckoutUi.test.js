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
    assert.deepEqual(buildFounderCheckoutBody(offerId, "retry_token_123456"), { offerId, requestId: "retry_token_123456" });
  }
});

test("successful checkout results accept only exact safe Square hosts", () => {
  for (const checkoutUrl of ["https://square.link/u/safe", "https://checkout.square.site/pay/safe"]) {
    assert.equal(validateFounderCheckoutResult(response(), { orderId: "internal", checkoutUrl }).checkoutUrl, checkoutUrl);
  }
  for (const checkoutUrl of [
    "http://square.link/u/x", "https://user:pass@square.link/u/x", "https://square.link:443/u/x",
    "https://square.link:8443/u/x", "https://evil.square.link/u/x", "https://square.link.evil.test/u/x",
    "https://checkout.square.site.evil.test/u/x", "not a url", "", " https://square.link/u/x",
  ]) assert.throws(() => validateFounderCheckoutResult(response(), { orderId: "internal", checkoutUrl }), /checkout_failed/);
});

test("missing, unexpected, and API-error results are rejected", () => {
  for (const [res, result] of [
    [response(false), { orderId: "internal", checkoutUrl: "https://square.link/u/x" }],
    [response(), { error: "service_unavailable" }], [response(), null],
    [response(), { orderId: "internal", checkoutUrl: "https://square.link/u/x", provider: "square" }],
  ]) assert.throws(() => validateFounderCheckoutResult(res, result), /checkout_failed/);
});

test("Founder button uses validated helpers and remains launch-disabled", () => {
  const source = fs.readFileSync("components/FounderCheckoutButton.js", "utf8");
  assert.match(source, /buildFounderCheckoutBody/);
  assert.match(source, /validateFounderCheckoutResult/);
  assert.match(source, /if \(!enabled\).*Available at launch/);
  assert.match(source, /tattoo-portal\?returnTo=%2Ffounders/);
});
