import { createHash } from "node:crypto";
export const MESSAGE_LINKS = Object.freeze({ applicationId: "membershipApplications", consultRequestId: "consultRequests", membershipChangeRequestId: "membershipChangeRequests", membershipOfferResponseId: "membershipOfferResponses" });
export function messageReceiptDigest(message) {
  return createHash("sha256").update(JSON.stringify([
    message.senderUid, message.conversationId, message.body,
    ...Object.keys(MESSAGE_LINKS).map(key => message[key] ?? null),
    message.sourceType ?? null, message.sourceId ?? null,
  ])).digest("hex");
}
