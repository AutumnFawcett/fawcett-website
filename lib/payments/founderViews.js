import { FOUNDER_OFFERS } from "./founderOffers.js";

export const FOUNDER_GOAL_CENTS = 5000000;
const environments = new Set(["sandbox", "production"]);
const statuses = new Set(["active", "inactive", "disputed_hold"]);
const tiers = Object.values(FOUNDER_OFFERS).map((offer) => ({ id: offer.offerId, name: offer.itemName, thresholdCents: offer.amountCents })).sort((a, b) => a.thresholdCents - b.thresholdCents);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const dateValue = (value) => value?.toDate?.() || (value instanceof Date ? value : null);

export function validateFounderProfile(profile, { environment, uid } = {}) {
  const recognitionValid = (profile?.recognitionMode === "anonymous" && profile.publicRecognitionEnabled === false)
    || (profile?.recognitionMode === "public" && profile.publicRecognitionEnabled === true);
  if (!profile || !environments.has(environment) || profile.environment !== environment
    || (uid && profile.clientUid !== uid) || typeof profile.clientUid !== "string" || !profile.clientUid
    || profile.currency !== "CAD" || !recognitionValid || !statuses.has(profile.status)
    || !integer(profile.founderNumber) || profile.founderNumber < 1
    || !["confirmedContributionCents", "eligibleContributionCents", "refundedContributionCents", "disputedContributionCents"].every((key) => integer(profile[key]))) {
    throw new Error("invalid_founder_profile");
  }
  const earned = tiers.filter((tier) => profile.eligibleContributionCents >= tier.thresholdCents).at(-1) || null;
  if ((profile.earnedTierId || null) !== (earned?.id || null) || (profile.earnedTierName || null) !== (earned?.name || null)) throw new Error("invalid_founder_profile");
  return profile;
}

export function safeFounderProfile(profile, options) {
  validateFounderProfile(profile, options);
  const next = tiers.find((tier) => profile.eligibleContributionCents < tier.thresholdCents) || null;
  return {
    founderNumber: profile.founderNumber, earnedTierId: profile.earnedTierId, earnedTierName: profile.earnedTierName,
    confirmedContributionCents: profile.confirmedContributionCents, eligibleContributionCents: profile.eligibleContributionCents,
    refundedContributionCents: profile.refundedContributionCents, disputedContributionCents: profile.disputedContributionCents,
    currency: "CAD", status: profile.status, recognitionMode: profile.recognitionMode,
    publicRecognitionEnabled: profile.publicRecognitionEnabled,
    nextTier: next && { ...next, remainingCents: next.thresholdCents - profile.eligibleContributionCents,
      progressPercent: Math.min(100, Math.floor(profile.eligibleContributionCents * 100 / next.thresholdCents)) },
    createdAt: dateValue(profile.createdAt)?.toISOString() || null, updatedAt: dateValue(profile.updatedAt)?.toISOString() || null,
  };
}

export function recognitionPair(value) {
  if (!value || Object.keys(value).length !== 2) throw new Error("invalid_recognition");
  if (value.recognitionMode === "anonymous" && value.publicRecognitionEnabled === false) return value;
  if (value.recognitionMode === "public" && value.publicRecognitionEnabled === true) return value;
  throw new Error("invalid_recognition");
}

export function campaignStats(profiles, environment) {
  let eligibleAmountCents = 0;
  let supporterCount = 0;
  for (const profile of profiles) {
    validateFounderProfile(profile, { environment });
    eligibleAmountCents += profile.eligibleContributionCents;
    if (!Number.isSafeInteger(eligibleAmountCents)) throw new Error("invalid_campaign_total");
    supporterCount += 1;
  }
  return { goalAmountCents: FOUNDER_GOAL_CENTS, eligibleAmountCents, supporterCount,
    percentage: Math.min(100, Math.max(0, eligibleAmountCents * 100 / FOUNDER_GOAL_CENTS)) };
}
