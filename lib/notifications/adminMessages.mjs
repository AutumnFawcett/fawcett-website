import { approvedSnapshot } from "../safety/publicationState.mjs";
import { fencedFirestore } from "../safety/serverFence.mjs";
import { FieldValue } from "firebase-admin/firestore";
import { portalProjection } from "../portalProjection.mjs";
import { MESSAGE_LINKS as links, messageReceiptDigest } from "./messageIdentity.mjs";
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const uidValid = value => typeof value === "string" && value.length > 0 && value.length <= 128 && !value.includes("/");
const fail = () => { throw new Error("message_not_authorized"); };
const sourceLinks = { consult: "consultRequestId", consultRequest: "consultRequestId", application: "applicationId", membershipApplication: "applicationId", offer_response: "membershipOfferResponseId", membershipOfferResponse: "membershipOfferResponseId", membership_request: "membershipChangeRequestId", membershipChangeRequest: "membershipChangeRequestId" };
export async function sendAdminMessage(firestore, uid, input) {
  firestore = fencedFirestore(firestore);
  if (!uidValid(uid) || !input || Object.keys(input).some(k => !["id", "conversationId", "body", "relationships", "sourceType", "sourceId"].includes(k)) || !id(input.id) || !id(input.conversationId) || typeof input.body !== "string" || !input.body.trim() || input.body.length > 20000) fail();
  const body = input.body.trim();
  const relationships = input.relationships ?? {};
  if (!relationships || typeof relationships !== "object" || Array.isArray(relationships) || Object.keys(relationships).some(key => !Object.hasOwn(links, key))) fail();
  return firestore.runTransaction(async tx => {
    const admin = await tx.get(firestore.doc(`adminUsers/${uid}`));
    if (admin.data()?.active !== true) fail();
    const sourceRef = firestore.doc(`messages/${input.id}`);
    const receiptRef = firestore.doc(`notificationMessageReceipts/${input.id}`);
    const [existing, receipt, conversation, view] = await Promise.all([tx.get(sourceRef), tx.get(receiptRef), tx.get(firestore.doc(`conversations/${input.conversationId}`)), tx.get(firestore.doc(`portalRecords/conversations/records/${input.conversationId}`))]);
    const conversationPolicy = await tx.get(firestore.doc(`publicationRecords/conversations/records/${input.conversationId}`));
    const data = conversation.data();
    // Legacy unreviewed conversations await explicit projection migration.
    if (!data || !uidValid(data.clientUid) || !approvedSnapshot(conversationPolicy.data(), view.data(), data.clientUid)) fail();
    const message = { clientUid: data.clientUid, conversationId: input.conversationId, senderUid: uid, senderRole: "admin", senderName: "Fawcett Tattoos & Art Studio", body, createdAt: FieldValue.serverTimestamp() };
    const related = {};
    for (const [key, collection] of Object.entries(links)) {
      const supplied = relationships[key];
      if (supplied != null && data[key] != null && supplied !== data[key]) fail();
      const value = supplied ?? data[key];
      if (value == null) continue;
      if (!id(value)) fail();
      related[key] = (await tx.get(firestore.doc(`${collection}/${value}`))).data();
      if (related[key]?.clientUid !== data.clientUid) fail();
      message[key] = value;
    }
    // Reusing an application's conversation must retain the selected response
    // relationship, while refusing a response from a different application.
    if (message.applicationId && related.membershipOfferResponseId?.applicationId !== undefined && related.membershipOfferResponseId.applicationId !== message.applicationId) fail();
    const sourceType = input.sourceType ?? data.sourceType;
    const sourceId = input.sourceId ?? data.sourceId;
    if (sourceType != null || sourceId != null) {
      const key = sourceType === "message" ? "conversationId" : sourceLinks[sourceType];
      if (!key || !id(sourceId) || message[key] !== sourceId) fail();
      message.sourceType = sourceType; message.sourceId = sourceId;
    }
    const digest = messageReceiptDigest(message);
    if (existing.exists || receipt.exists) {
      if (receipt.data()?.digest !== digest || !existing.exists) fail();
      return { id: input.id };
    }
    if (typeof data.clientEmail === "string") message.clientEmail = data.clientEmail;
    tx.create(sourceRef, message);
    const approved = portalProjection("messages", message);
    tx.create(firestore.doc(`portalRecords/messages/records/${input.id}`), approved);
    tx.create(firestore.doc(`publicationRecords/messages/records/${input.id}`), { schemaVersion: 1, state: "approved", mode: "admin_reply", actorUid: uid, reviewedAt: FieldValue.serverTimestamp(), approved });
    tx.create(receiptRef, { messageId: input.id, actorUid: uid, clientUid: data.clientUid, digest, createdAt: FieldValue.serverTimestamp() });
    const preview = { lastMessagePreview: body.slice(0, 140), lastMessageAt: FieldValue.serverTimestamp(), unreadForAdmin: false, unreadForClient: true, updatedAt: FieldValue.serverTimestamp() };
    tx.update(conversation.ref, preview);
    tx.update(view.ref, preview);
    tx.set(firestore.doc(`publicationRecords/conversations/records/${input.conversationId}`), { schemaVersion: 1, state: "approved", mode: "admin_reply", actorUid: uid, reviewedAt: FieldValue.serverTimestamp(), approved: { ...view.data(), ...preview } });
    return { id: input.id };
  });
}
export async function handleAdminMessage(request, { firestore, authenticate }) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  try {
    const uid = await authenticate(request);
    if (!(request.headers.get("content-type") || "").startsWith("application/json")) throw new Error();
    const raw = await request.text();
    if (raw.length > 24000) throw new Error();
    return Response.json(await sendAdminMessage(firestore, uid, JSON.parse(raw)), { headers });
  } catch (error) { return Response.json({ error: error.code === "maintenance" ? "maintenance" : "message_not_authorized" }, { status: error.code === "maintenance" ? 503 : 403, headers }); }
}
