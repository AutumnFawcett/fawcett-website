import test from "node:test";
import assert from "node:assert/strict";
import { earnedFounderTier, founderContributionId, founderProfileId } from "../../lib/payments/founderEntitlements.js";

test("Founder tier calculation selects the highest exact cumulative threshold", () => {
  const cases = [[0, null], [999, null], [1000, "founder-10-v1"], [2500, "digital-founder-25-v1"], [5000, "studio-supporter-50-v1"], [10000, "art-founder-100-v1"], [25000, "opening-founder-250-v1"]];
  for (const [amount, id] of cases) assert.equal(earnedFounderTier(amount)?.id || null, id);
});

test("Founder identities are deterministic and environment separated", () => {
  assert.equal(founderProfileId("sandbox", "client"), founderProfileId("sandbox", "client"));
  assert.notEqual(founderProfileId("sandbox", "client"), founderProfileId("production", "client"));
  const transaction = { provider: "square", environment: "sandbox", providerTransactionId: "payment" };
  assert.equal(founderContributionId(transaction), founderContributionId({ ...transaction }));
  assert.notEqual(founderContributionId(transaction), founderContributionId({ ...transaction, environment: "production" }));
});
