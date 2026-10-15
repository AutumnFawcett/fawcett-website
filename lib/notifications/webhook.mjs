import { createHmac, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { hash } from "./queue.mjs";
const states = { "email.delivered": "delivered", "email.bounced": "bounced", "email.complained": "complained", "email.failed": "failed", "email.delivery_delayed": "delivery_delayed" };
const rank = { accepted: 0, delivery_delayed: 1, delivered: 2, failed: 3, bounced: 4, complained: 5 };
export function verifyResendWebhook(raw, headers, secret, now = Date.now()) {
  const id = headers.get("svix-id"), timestamp = headers.get("svix-timestamp");
  if (!id || id.length > 256 || !/^\d+$/.test(timestamp || "") || Math.abs(now / 1000 - Number(timestamp)) > 300 || !secret?.startsWith("whsec_")) throw new Error("invalid_webhook");
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 16) throw new Error("invalid_webhook_key");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${raw}`).digest();
  const valid = (headers.get("svix-signature") || "").split(" ").some(part => {
    if (!part.startsWith("v1,")) return false;
    const signature = Buffer.from(part.slice(3), "base64");
    return signature.length === expected.length && timingSafeEqual(signature, expected);
  });
  if (!valid) throw new Error("invalid_webhook");
  return id;
}
export async function handleResendWebhook(request, firestore, { secret, now = Date.now() } = {}) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const raw = await request.text();
    if (raw.length > 16000) throw new Error("invalid_webhook");
    const eventId = verifyResendWebhook(raw, request.headers, secret, now);
    const event = JSON.parse(raw);
    const status = states[event.type];
    if (!status) return Response.json({ received: true }, { headers });
    const providerId = event.data?.email_id;
    if (typeof providerId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(providerId)) throw new Error("invalid_webhook");
    const matches = await firestore.collection("notificationQueue").where("providerId", "==", providerId).limit(2).get();
    // Provider may notify before the sender persisted acceptance. Retry safely.
    if (matches.size !== 1) return Response.json({ error: "acceptance_not_reconciled" }, { status: 503, headers });
    const ref = matches.docs[0].ref;
    await firestore.runTransaction(async tx => {
      const journal = firestore.doc(`notificationWebhookEvents/${hash(eventId)}`);
      const [existing, job] = await Promise.all([tx.get(journal), tx.get(ref)]);
      if (existing.exists) return;
      const data = job.data();
      if (!(data.status in rank)) throw new Error("invalid_webhook_state");
      tx.create(journal, { notificationId: ref.id, type: event.type, receivedAt: FieldValue.serverTimestamp() });
      if (rank[status] > rank[data.status]) tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
      if (["bounced", "complained"].includes(status) && data.recipientHash) tx.set(firestore.doc(`notificationSuppressions/${data.recipientHash}`), { reason: status, updatedAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ received: true }, { headers });
  } catch { return Response.json({ error: "invalid_webhook" }, { status: 400, headers }); }
}
