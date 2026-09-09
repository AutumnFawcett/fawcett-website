import { createHash } from "node:crypto";
import { FOUNDER_OFFERS } from "./founderOffers.js";

const TIERS = Object.freeze(Object.values(FOUNDER_OFFERS)
  .map(({ offerId, amountCents, itemName }) => ({ id: offerId, name: itemName, threshold: amountCents }))
  .sort((a, b) => a.threshold - b.threshold));

function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function validText(value) { return typeof value === "string" && value.trim().length > 0; }

export function founderProfileId(environment, clientUid) {
  return `${environment}_${digest(`${environment}:${clientUid}`)}`;
}

export function founderContributionId(transaction) {
  return digest(`${transaction.provider}:${transaction.environment}:${transaction.providerTransactionId}`);
}

export function earnedFounderTier(eligibleContributionCents) {
  let earned = null;
  for (const tier of TIERS) if (eligibleContributionCents >= tier.threshold) earned = tier;
  return earned;
}

function assertTrustedFounderEffect({ environment, order, transaction }) {
  if (!order || !transaction || transaction.provider !== "square" || order.provider !== "square"
    || transaction.environment !== environment || order.environment !== environment
    || transaction.currency !== "CAD" || order.currency !== "CAD"
    || transaction.purpose !== "founder" || order.purpose !== "founder"
    || !["pending", "paid", "refunded", "disputed"].includes(order.status)
    || !validText(transaction.clientUid) || transaction.clientUid !== order.clientUid
    || transaction.orderId !== order.orderId || transaction.providerOrderId !== order.providerOrderId
    || !validText(transaction.providerTransactionId)
    || !Number.isSafeInteger(transaction.amountCents) || transaction.amountCents < 0) {
    throw new Error("founder_entitlement_identity_mismatch");
  }
  const offer = FOUNDER_OFFERS[order.offerId];
  if (!offer || order.offerVersion !== offer.offerVersion || order.amountCents !== offer.amountCents) {
    throw new Error("founder_entitlement_offer_mismatch");
  }
  if (transaction.type === "charge") {
    if (transaction.status !== "completed" || transaction.amountCents !== order.amountCents) throw new Error("founder_entitlement_charge_mismatch");
  } else if (transaction.type === "refund") {
    if (transaction.status !== "completed" || !validText(transaction.parentTransactionId)) throw new Error("founder_entitlement_refund_mismatch");
  } else if (transaction.type === "chargeback") {
    if (transaction.status !== "funds_withheld" || !validText(transaction.parentTransactionId)) throw new Error("founder_entitlement_dispute_mismatch");
  } else throw new Error("founder_entitlement_effect_unsupported");
}

function sameContribution(existing, expected) {
  const authoritativeFields = [
    "profileId", "clientUid", "environment", "orderId", "transactionId", "provider",
    "providerTransactionId", "providerPaymentId", "providerOrderId", "effectType",
    "signedEffectCents", "amountCents", "currency", "offerId", "offerVersion",
    "parentTransactionId",
  ];
  return authoritativeFields.every((key) => existing[key] === expected[key]);
}

// Must run inside the webhook transaction. A WON dispute intentionally has no
// restoration effect until an authoritative reversal/reconciliation path exists.
export async function applyFounderEntitlement({ firestore, tx, environment, order, transaction, transactionId, timestamp }) {
  if (transaction.purpose !== "founder") return { applied: false };
  assertTrustedFounderEffect({ environment, order, transaction });
  const profileId = founderProfileId(environment, transaction.clientUid);
  const contributionId = founderContributionId(transaction);
  const profileRef = firestore.collection("founderProfiles").doc(profileId);
  const contributionRef = firestore.collection("founderContributions").doc(contributionId);
  const counterRef = firestore.collection("founderCounters").doc(environment);
  const profileSnap = await tx.get(profileRef);
  const contributionSnap = await tx.get(contributionRef);
  const effectType = transaction.type === "charge" ? "confirmed_charge" : transaction.type === "refund" ? "completed_refund" : "dispute_withheld";
  const contribution = {
    profileId, clientUid: transaction.clientUid, environment, orderId: order.orderId, transactionId,
    provider: "square", providerTransactionId: transaction.providerTransactionId,
    providerPaymentId: transaction.providerPaymentId, providerOrderId: transaction.providerOrderId,
    effectType, signedEffectCents: transaction.type === "charge" ? transaction.amountCents : -transaction.amountCents,
    amountCents: transaction.amountCents, currency: "CAD", offerId: order.offerId,
    offerVersion: order.offerVersion, createdAt: timestamp,
  };
  if (transaction.parentTransactionId) contribution.parentTransactionId = transaction.parentTransactionId;
  if (transaction.providerState) contribution.providerState = transaction.providerState;
  if (contributionSnap.exists) {
    if (!sameContribution(contributionSnap.data(), contribution)) throw new Error("founder_contribution_collision");
    return { applied: false, duplicate: true, profileId, contributionId };
  }
  const profile = profileSnap.exists ? profileSnap.data() : null;
  if (profile && (profile.clientUid !== transaction.clientUid || profile.environment !== environment
    || profile.currency !== "CAD" || profile.recognitionMode !== "anonymous"
    || profile.publicRecognitionEnabled !== false || !Number.isSafeInteger(profile.founderNumber)
    || !["confirmedContributionCents", "refundedContributionCents", "disputedContributionCents", "eligibleContributionCents"]
      .every((field) => Number.isSafeInteger(profile[field]) && profile[field] >= 0))) throw new Error("founder_profile_collision");
  if (!profile && transaction.type !== "charge") throw new Error("founder_profile_missing_for_reversal");
  let founderNumber = profile?.founderNumber;
  if (!profile) {
    const counterSnap = await tx.get(counterRef);
    const nextNumber = counterSnap.exists ? counterSnap.data().nextNumber : 1;
    if ((counterSnap.exists && counterSnap.data().environment !== environment)
      || !Number.isSafeInteger(nextNumber) || nextNumber < 1) throw new Error("founder_counter_invalid");
    founderNumber = nextNumber;
    tx.set(counterRef, { environment, nextNumber: nextNumber + 1, updatedAt: timestamp });
  }
  const confirmed = (profile?.confirmedContributionCents || 0) + (transaction.type === "charge" ? transaction.amountCents : 0);
  const refunded = (profile?.refundedContributionCents || 0) + (transaction.type === "refund" ? transaction.amountCents : 0);
  const disputed = (profile?.disputedContributionCents || 0) + (transaction.type === "chargeback" ? transaction.amountCents : 0);
  const eligible = transaction.type === "charge" ? (profile?.eligibleContributionCents || 0) + transaction.amountCents : Math.max(0, (profile?.eligibleContributionCents || 0) - transaction.amountCents);
  const tier = earnedFounderTier(eligible);
  const updated = {
    clientUid: transaction.clientUid, environment, founderNumber, recognitionMode: "anonymous",
    publicRecognitionEnabled: false, currency: "CAD", confirmedContributionCents: confirmed,
    refundedContributionCents: refunded, disputedContributionCents: disputed,
    eligibleContributionCents: eligible, earnedTierId: tier?.id || null, earnedTierName: tier?.name || null,
    status: transaction.type === "chargeback" || profile?.status === "disputed_hold" ? "disputed_hold" : tier ? "active" : "inactive",
    createdAt: profile?.createdAt || timestamp, updatedAt: timestamp,
  };
  tx.create(contributionRef, contribution);
  if (profileSnap.exists) tx.update(profileRef, updated); else tx.create(profileRef, updated);
  return { applied: true, profileId, contributionId, founderNumber };
}
