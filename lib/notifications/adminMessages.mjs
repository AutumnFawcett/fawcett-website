import { FieldValue } from "firebase-admin/firestore";
import { portalProjection } from "../portalProjection.mjs";
import { createHash } from "node:crypto";
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const uidValid = value => typeof value === "string" && value.length > 0 && value.length <= 128 && !value.includes("/");
const fail = () => { throw new Error("message_not_authorized"); };
const sourceLinks = { consult: "consultRequestId", consultRequest: "consultRequestId", application: "applicationId", membershipApplication: "applicationId", offer_response: "membershipOfferResponseId", membershipOfferResponse: "membershipOfferResponseId", membership_request: "membershipChangeRequestId", membershipChangeRequest: "membershipChangeRequestId" };
const links = { applicationId: "membershipApplications", consultRequestId: "consultRequests", membershipChangeRequestId: "membershipChangeRequests", membershipOfferResponseId: "membershipOfferResponses" };
export async function sendAdminMessage(firestore, uid, input) {
  if (!uidValid(uid) || !input || Object.keys(input).some(k => !["id", "conversationId", "body"].includes(k)) || !id(input.id) || !id(input.conversationId) || typeof input.body !== "string" || !input.body.trim() || input.body.length > 20000) fail();
  const body = input.body.trim();
  const digest = createHash("sha256").update(JSON.stringify([uid, input.conversationId, body])).digest("hex");
  return firestore.runTransaction(async tx => {
    const admin = await tx.get(firestore.doc(`adminUsers/${uid}`));
    if (admin.data()?.active !== true) fail();
    const sourceRef = firestore.doc(`messages/${input.id}`);
    const receiptRef = firestore.doc(`notificationMessageReceipts/${input.id}`);
    const [existing, receipt, conversation, view] = await Promise.all([tx.get(sourceRef), tx.get(receiptRef), tx.get(firestore.doc(`conversations/${input.conversationId}`)), tx.get(firestore.doc(`portalRecords/conversations/records/${input.conversationId}`))]);
    const data = conversation.data();
    // Legacy unreviewed conversations await explicit projection migration.
    if (!data || !uidValid(data.clientUid) || view.data()?.clientUid !== data.clientUid) fail();
    for (const [key, collection] of Object.entries(links)) {
      if (data[key] == null) continue;
      if (!id(data[key])) fail();
      const related = await tx.get(firestore.doc(`${collection}/${data[key]}`));
      if (related.data()?.clientUid !== data.clientUid) fail();
    }
    if (data.sourceId != null || data.sourceType != null) {
      const key = sourceLinks[data.sourceType];
      if (!key || !id(data.sourceId) || data[key] !== data.sourceId) fail();
    }
    if (existing.exists || receipt.exists) {
      if (receipt.data()?.digest !== digest || !existing.exists) fail();
      return { id: input.id };
    }
    const message = { clientUid: data.clientUid, conversationId: input.conversationId, senderUid: uid, senderRole: "admin", senderName: "Fawcett Tattoos & Art Studio", body, createdAt: FieldValue.serverTimestamp() };
    for (const key of Object.keys(links)) if (data[key] != null) message[key] = data[key];
    if (data.sourceType != null) { message.sourceType = data.sourceType; message.sourceId = data.sourceId; }
    if (typeof data.clientEmail === "string") message.clientEmail = data.clientEmail;
    tx.create(sourceRef, message);
    tx.create(firestore.doc(`portalRecords/messages/records/${input.id}`), portalProjection("messages", message));
    tx.create(receiptRef, { messageId: input.id, actorUid: uid, clientUid: data.clientUid, digest, createdAt: FieldValue.serverTimestamp() });
    const preview = { lastMessagePreview: body.slice(0, 140), lastMessageAt: FieldValue.serverTimestamp(), unreadForAdmin: false, unreadForClient: true, updatedAt: FieldValue.serverTimestamp() };
    tx.update(conversation.ref, preview);
    tx.update(view.ref, preview);
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
  } catch { return Response.json({ error: "message_not_authorized" }, { status: 403, headers }); }
}
