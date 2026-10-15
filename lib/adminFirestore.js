import { collection, doc, runTransaction } from "firebase/firestore";
import { PORTAL_FIELDS, PUBLISHED_OFFER_STATUSES, applyRecordPatch, portalProjection } from "./portalProjection.mjs";

export function portalRecordRef(sourceRef) {
  const parts = sourceRef.path.split("/");
  if (parts.length !== 2 || !PORTAL_FIELDS[parts[0]]) throw new Error("Unsupported CRM record path");
  return doc(sourceRef.firestore, "portalRecords", parts[0], "records", parts[1]);
}

async function writeAdminRecord(ref, data, operation, options) {
  const publicRef = portalRecordRef(ref);
  return runTransaction(ref.firestore, async (tx) => {
    const snapshot = await tx.get(ref);
    const publicSnapshot = await tx.get(publicRef);
    if (operation === "update" && !snapshot.exists()) throw new Error("Cannot update missing CRM record");
    const next = operation === "update" || options?.merge
      ? applyRecordPatch(snapshot.data() || {}, data, operation !== "update") : data;
    if (operation === "update") tx.update(ref, data);
    else tx.set(ref, data, ...(options ? [options] : []));
    const previous = snapshot.data() || {};
    const publishesTimeline = ref.parent.id === "projectTimeline"
      && previous.clientVisible !== true && data.clientVisible === true;
    const releasesOffer = ref.parent.id === "membershipOffers"
      && !PUBLISHED_OFFER_STATUSES.includes(previous.offerStatus || previous.status)
      && PUBLISHED_OFFER_STATUSES.includes(next.offerStatus || next.status);
    const shouldPublish = !snapshot.exists() || publicSnapshot.exists()
      || publishesTimeline || releasesOffer;
    if (!shouldPublish) return;
    const projection = portalProjection(ref.parent.id, next);
    // Existing sources without a view await the separately approved migration.
    // Ordinary admin edits must not silently publish legacy message bodies.
    // Replace the whole projection to remove fields that stopped being public.
    if (projection) tx.set(publicRef, projection);
    else if (!projection) tx.delete(publicRef);
  });
}
export async function addDoc(collectionRef, data) {
  const ref = doc(collectionRef);
  await writeAdminRecord(ref, data, "set");
  return ref;
}
export function setDoc(ref, data, options) { return writeAdminRecord(ref, data, "set", options); }
export function updateDoc(ref, data) { return writeAdminRecord(ref, data, "update"); }
// Admin reads intentionally stay on the original private collections.
export { collection };
