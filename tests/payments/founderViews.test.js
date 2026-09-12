import test from "node:test";
import assert from "node:assert/strict";
import { campaignStats, formatCampaignPercentage, recognitionPair, safeFounderProfile } from "../../lib/payments/founderViews.js";
import { FOUNDER_TIERS } from "../../lib/payments/founderOffers.js";

const base = { clientUid: "client-a", environment: "sandbox", currency: "CAD", founderNumber: 1,
  recognitionMode: "anonymous", publicRecognitionEnabled: false, confirmedContributionCents: 1000,
  eligibleContributionCents: 1000, refundedContributionCents: 0, disputedContributionCents: 0,
  earnedTierId: "founder-10-v1", earnedTierName: "Founder", status: "active" };

test("$10 Founder receives current benefits and only the Digital Founder increment next", () => {
  const result = safeFounderProfile(base, { environment: "sandbox", uid: "client-a" });
  assert.equal(result.founderNumber, 1);
  assert.equal(result.earnedTierName, "Founder");
  assert.deepEqual(result.earnedBenefits, ["Permanent Founder number", "Permanent Founder status", "Optional future Founder Wall recognition"]);
  assert.deepEqual(result.nextTier, { id: "digital-founder-25-v1", name: "Digital Founder", thresholdCents: 2500, remainingCents: 1500, additionalBenefits: ["Digital Founder badge"], progressPercent: 40 });
  assert.equal("clientUid" in result, false);
});
test("current benefits are cumulative and next benefits are incremental at every tier", () => {
  const cases = [
    [1000, "founder-10-v1", "Founder", 3, ["Digital Founder badge"]],
    [2500, "digital-founder-25-v1", "Digital Founder", 4, ["Founder sticker pack"]],
    [5000, "studio-supporter-50-v1", "Studio Supporter", 5, ["Limited Founder art print"]],
    [10000, "art-founder-100-v1", "Art Founder", 6, ["Founder shirt", "Grand-opening invitation and studio tour"]],
    [25000, "opening-founder-250-v1", "Opening Founder", 8, null],
  ];
  for (const [amount, id, name, benefitCount, nextBenefits] of cases) {
    const result = safeFounderProfile({ ...base, confirmedContributionCents: amount, eligibleContributionCents: amount, earnedTierId: id, earnedTierName: name }, { environment: "sandbox" });
    assert.equal(result.earnedBenefits.length, benefitCount);
    assert.deepEqual(result.earnedBenefits, FOUNDER_TIERS.find((tier) => tier.id === id).benefits);
    assert.deepEqual(result.nextTier?.additionalBenefits || null, nextBenefits);
  }
});
test("no earned tier exposes no benefits or permanent status", () => {
  const result = safeFounderProfile({ ...base, confirmedContributionCents: 0, eligibleContributionCents: 0, earnedTierId: null, earnedTierName: null }, { environment: "sandbox" });
  assert.deepEqual(result.earnedBenefits, []);
  assert.equal(result.hasPermanentFounderStatus, false);
  assert.equal(result.recognitionEligible, false);
  assert.equal(result.nextTier.remainingCents, 1000);
});
test("between thresholds uses eligible total and never awards the next tier early", () => {
  const result = safeFounderProfile({ ...base, confirmedContributionCents: 2499, eligibleContributionCents: 2499 }, { environment: "sandbox" });
  assert.equal(result.earnedTierName, "Founder");
  assert.equal(result.nextTier.remainingCents, 1);
  assert.deepEqual(result.nextTier.additionalBenefits, ["Digital Founder badge"]);
});
test("top tier has a completed next-tier state", () => { const result = safeFounderProfile({ ...base, confirmedContributionCents: 25000, eligibleContributionCents: 25000, earnedTierId: "opening-founder-250-v1", earnedTierName: "Opening Founder" }, { environment: "sandbox", uid: "client-a" }); assert.equal(result.nextTier, null); });
test("refund and disputed hold fields remain visible", () => { const result = safeFounderProfile({ ...base, confirmedContributionCents: 3000, refundedContributionCents: 1000, disputedContributionCents: 1000, status: "disputed_hold" }, { environment: "sandbox" }); assert.equal(result.status, "disputed_hold"); assert.equal(result.refundedContributionCents, 1000); });
test("recognition accepts exactly the invariant pairs", () => { assert.equal(recognitionPair({ recognitionMode: "public", publicRecognitionEnabled: true }).recognitionMode, "public"); assert.equal(recognitionPair({ recognitionMode: "anonymous", publicRecognitionEnabled: false }).recognitionMode, "anonymous"); assert.throws(() => recognitionPair({ recognitionMode: "public", publicRecognitionEnabled: false })); assert.throws(() => recognitionPair({ recognitionMode: "anonymous", publicRecognitionEnabled: false, founderNumber: 9 })); });
test("profiles fail closed for missing data, wrong owner, environment, malformed totals, and tier inconsistency", () => { assert.throws(() => safeFounderProfile(null, { environment: "sandbox" })); assert.throws(() => safeFounderProfile(base, { environment: "sandbox", uid: "client-b" })); assert.throws(() => safeFounderProfile(base, { environment: "production" })); assert.throws(() => safeFounderProfile({ ...base, eligibleContributionCents: -1 }, { environment: "sandbox" })); assert.throws(() => safeFounderProfile({ ...base, eligibleContributionCents: "1000" }, { environment: "sandbox" })); assert.throws(() => safeFounderProfile({ ...base, earnedTierId: null, earnedTierName: null }, { environment: "sandbox" })); });
test("public campaign stats contain aggregates only and isolate environments", () => { const result = campaignStats([base], "sandbox"); assert.deepEqual(Object.keys(result), ["goalAmountCents", "eligibleAmountCents", "supporterCount", "percentage"]); assert.equal(result.eligibleAmountCents, 1000); assert.equal(JSON.stringify(result).includes("client-a"), false); assert.throws(() => campaignStats([base], "production")); });
test("campaign progress clamps at the goal", () => { const rich = { ...base, confirmedContributionCents: 6000000, eligibleContributionCents: 6000000, earnedTierId: "opening-founder-250-v1", earnedTierName: "Opening Founder" }; assert.equal(campaignStats([rich], "sandbox").percentage, 100); });
test("campaign percentage preserves useful early progress and clamps safely", () => {
  assert.equal(formatCampaignPercentage(0, 5000000), "0%");
  assert.equal(formatCampaignPercentage(1000, 5000000), "0.02%");
  assert.equal(formatCampaignPercentage(1250000, 5000000), "25%");
  assert.equal(formatCampaignPercentage(1665000, 5000000), "33.3%");
  assert.equal(formatCampaignPercentage(5000000, 5000000), "100%");
  assert.equal(formatCampaignPercentage(6000000, 5000000), "100%");
});
