import "server-only";
import { founderProfileId } from "../payments/founderEntitlements.js";
import { campaignStats, recognitionPair, safeFounderProfile, validateFounderProfile } from "../payments/founderViews.js";

export function configuredFounderEnvironment(env = process.env) {
  const value = env.SQUARE_ENVIRONMENT;
  if (value !== "sandbox" && value !== "production") throw new Error("configuration_unavailable");
  return value;
}
export async function readFounderProfile(firestore, uid, environment) {
  const snap = await firestore.collection("founderProfiles").doc(founderProfileId(environment, uid)).get();
  return snap.exists ? safeFounderProfile(snap.data(), { environment, uid }) : null;
}
export async function updateFounderRecognition(firestore, uid, environment, input) {
  const pair = recognitionPair(input);
  const ref = firestore.collection("founderProfiles").doc(founderProfileId(environment, uid));
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("profile_not_found");
    validateFounderProfile(snap.data(), { environment, uid });
    tx.update(ref, pair);
    return { ...safeFounderProfile(snap.data(), { environment, uid }), ...pair };
  });
}
export async function listFounders(firestore, environment) {
  const snap = await firestore.collection("founderProfiles").where("environment", "==", environment).get();
  return snap.docs.map((doc) => ({ ...safeFounderProfile(doc.data(), { environment }), accountIdentifier: `Account ••••${doc.data().clientUid.slice(-4)}` }));
}
export async function readCampaignStats(firestore, environment) {
  const snap = await firestore.collection("founderProfiles").where("environment", "==", environment).get();
  return campaignStats(snap.docs.map((doc) => doc.data()), environment);
}
