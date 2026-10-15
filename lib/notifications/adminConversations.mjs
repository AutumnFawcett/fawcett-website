import { FieldValue } from "firebase-admin/firestore";
import { fencedFirestore } from "../safety/serverFence.mjs";
import { approvedSnapshot } from "../safety/publicationState.mjs";
import { MESSAGE_LINKS } from "./messageIdentity.mjs";
import { fingerprint } from "../migration/model.mjs";
const idValid = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const uidValid = value => typeof value === "string" && value.length > 0 && value.length <= 128 && !value.includes("/");
const fail = () => { throw new Error("conversation_not_authorized"); };
const sourceLinks = { consult: "consultRequestId", consultRequest: "consultRequestId", application: "applicationId", membershipApplication: "applicationId", offer_response: "membershipOfferResponseId", membershipOfferResponse: "membershipOfferResponseId", membership_request: "membershipChangeRequestId", membershipChangeRequest: "membershipChangeRequestId" };
export async function createAdminConversation(firestore, auth, uid, input) {
  firestore = fencedFirestore(firestore);
  if (!input || Object.keys(input).some(key => !["id", "data"].includes(key)) || !idValid(input.id)) fail();
  const data = input.data;
  const fields = ["clientUid", "clientName", "clientEmail", "subject", "assignedInbox", "assignedArtistId", "status", "sourceType", "sourceId", ...Object.keys(MESSAGE_LINKS)];
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(key => !fields.includes(key)) || !uidValid(data.clientUid)) fail();
  for (const [key, value] of Object.entries(data)) if (!(value === null || typeof value === "string" && value.length <= (key === "subject" ? 500 : 320))) fail();
  return firestore.runTransaction(async tx => {
    const admin = await tx.get(firestore.doc(`adminUsers/${uid}`));
    if (admin.data()?.active !== true) fail();
    const owner = await auth.getUser(data.clientUid); if (owner.disabled) fail();
    const source = firestore.doc(`conversations/${input.id}`), view = firestore.doc(`portalRecords/conversations/records/${input.id}`), policy = firestore.doc(`publicationRecords/conversations/records/${input.id}`), receipt = firestore.doc(`adminConversationReceipts/${input.id}`);
    const [existing, existingView, previous, issued] = await Promise.all([tx.get(source), tx.get(view), tx.get(policy), tx.get(receipt)]);
    const digest = fingerprint({ actorUid: uid, data });
    if (existing.exists || issued.exists) {
      if (issued.data()?.digest !== digest || !approvedSnapshot(previous.data(), existingView.data(), data.clientUid)) fail();
      return { id: input.id };
    }
    const links = {};
    for (const [key, collection] of Object.entries(MESSAGE_LINKS)) {
      if (data[key] == null) continue;
      if (!idValid(data[key])) fail();
      const record = (await tx.get(firestore.doc(`${collection}/${data[key]}`))).data();
      if (record?.clientUid !== data.clientUid) fail();
      if (key === "membershipOfferResponseId" && data.applicationId && record.applicationId !== data.applicationId) fail();
      links[key] = data[key];
    }
    if (data.sourceType != null || data.sourceId != null) {
      const key = sourceLinks[data.sourceType];
      if (!key || links[key] !== data.sourceId) fail();
    }
    const time = FieldValue.serverTimestamp();
    // Do not project supplied names, subject, selected-record summaries or old
    // previews. Only a fixed safe envelope is public until an explicit reply.
    const approved = { clientUid: data.clientUid, ...links, subject: "Tattoo Portal conversation", lastMessagePreview: "", unreadForAdmin: false, unreadForClient: false, createdAt: time, updatedAt: time, lastMessageAt: time };
    tx.create(source, { ...data, ...approved, subject: data.subject || approved.subject });
    tx.create(view, approved);
    tx.create(policy, { schemaVersion: 1, state: "approved", mode: "admin_conversation_envelope", actorUid: uid, reviewedAt: time, approved });
    tx.create(receipt, { actorUid: uid, digest, createdAt: time });
    return { id: input.id };
  });
}
