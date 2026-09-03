import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { foundersCampaign } from "../../lib/foundersCampaign.js";

test("all five Founder tiers map to the fixed versioned offer IDs", () => {
  assert.deepEqual(foundersCampaign.rewardTiers.map(({ offerId }) => offerId), ["founder-10-v1", "digital-founder-25-v1", "studio-supporter-50-v1", "art-founder-100-v1", "opening-founder-250-v1"]);
});
test("Founder checkout submits no commercial or identity fields and redirects only after a safe response", () => {
  const source = fs.readFileSync("components/FounderCheckoutButton.js", "utf8");
  assert.match(source, /JSON\.stringify\(\{ offerId, requestId:/);
  for (const field of ["amountCents", "currency", "clientUid", "paid"]) assert.equal(source.includes(field), false);
  assert.match(source, /if \(!enabled\).*Available at launch/);
  assert.match(source, /tattoo-portal\?returnTo=%2Ffounders/);
  assert.match(source, /disabled=\{working\}/);
  assert.match(source, /window\.location\.assign\(result\.checkoutUrl\)/);
});
