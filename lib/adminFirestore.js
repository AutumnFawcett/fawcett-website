import { assertBrowserWritesOpen } from "./safety/browserFence.js";
import { getAuth } from "firebase/auth";
import { collection, doc, runTransaction, deleteField } from "firebase/firestore";
import { PORTAL_FIELDS, PUBLISHED_OFFER_STATUSES, PRIVATE_TIMELINE_TYPES, applyRecordPatch } from "./portalProjection.mjs";

export function portalRecordRef(sourceRef) {
  const parts = sourceRef.path.split("/");
  if (parts.length !== 2 || !PORTAL_FIELDS[parts[0]]) throw new Error("Unsupported CRM record path");
  return doc(sourceRef.firestore, "portalRecords", parts[0], "records", parts[1]);
}

async function writeAdminRecord(ref, data, operation, options) {
  await assertBrowserWritesOpen(ref.firestore);
  const publicRef = portalRecordRef(ref);
  return runTransaction(ref.firestore, async (tx) => {
    const snapshot = await tx.get(ref);
    const publicSnapshot = await tx.get(publicRef);
    if (operation === "update" && !snapshot.exists()) throw new Error("Cannot update missing CRM record");
    const next = operation === "update" || options?.merge
      ? applyRecordPatch(snapshot.data() || {}, data, operation !== "update") : data;
    if (operation === "update") tx.update(ref, data);
    else tx.set(ref, data, ...(options ? [options] : []));
    const mustWithdraw = (ref.parent.id === "projectTimeline" && (!next.clientVisible || PRIVATE_TIMELINE_TYPES.includes(next.entryType)))
      || (ref.parent.id === "membershipOffers" && !PUBLISHED_OFFER_STATUSES.includes(next.offerStatus || next.status));
    // Source saves never publish or refresh public text. Keep the last reviewed
    // snapshot until a separate, source-bound publication authorization.
    const stateRef = doc(ref.firestore, "publicationRecords", ref.parent.id, "records", ref.id);
    const retainsView = publicSnapshot.exists() && !mustWithdraw && next.clientUid === publicSnapshot.data().clientUid;
    tx.set(stateRef, { schemaVersion: 1, state: retainsView ? "review_required" : "withheld", approved: retainsView ? publicSnapshot.data() : deleteField() }, { merge: true });
    if (!retainsView && publicSnapshot.exists()) tx.delete(publicRef);
  });
}
export async function addDoc(collectionRef, data) {
  const ref = doc(collectionRef);
  if (collectionRef.id === "conversations") {
    const user = getAuth(collectionRef.firestore.app).currentUser;
    if (!user) throw new Error("Admin authentication required");
    const fields = ["clientUid", "clientName", "clientEmail", "subject", "assignedInbox", "assignedArtistId", "status", "sourceType", "sourceId", "applicationId", "consultRequestId", "membershipChangeRequestId", "membershipOfferResponseId"];
    const response = await fetch("/api/admin/conversations", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ id: ref.id, data: Object.fromEntries(fields.filter(key => data[key] !== undefined).map(key => [key, data[key]])) }),
    });
    if (!response.ok) throw new Error("Could not create studio conversation. Please retry when studio updates are available.");
  } else if (collectionRef.id === "messages") {
    const user = getAuth(collectionRef.firestore.app).currentUser;
    if (!user) throw new Error("Admin authentication required");
    const response = await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({
        id: ref.id, conversationId: data.conversationId, body: data.body,
        relationships: Object.fromEntries(["applicationId", "consultRequestId", "membershipChangeRequestId", "membershipOfferResponseId"].filter(key => data[key] != null).map(key => [key, data[key]])),
        ...(data.sourceType != null ? { sourceType: data.sourceType, sourceId: data.sourceId } : {}),
      }),
    });
    if (!response.ok) throw new Error("Could not send portal message. Confirm the conversation has a reviewed portal record.");
  } else await writeAdminRecord(ref, data, "set");
  return ref;
}
export function setDoc(ref, data, options) { return writeAdminRecord(ref, data, "set", options); }
export function updateDoc(ref, data) { return writeAdminRecord(ref, data, "update"); }
// Admin reads intentionally stay on the original private collections.
export { collection };
