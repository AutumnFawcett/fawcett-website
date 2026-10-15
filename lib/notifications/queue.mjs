import { approvedSnapshot } from "../safety/publicationState.mjs";
import { fencedFirestore } from "../safety/serverFence.mjs";
import { assertServerWritesOpen } from "../safety/serverFence.mjs";
import { createHash, randomUUID } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { address } from "./config.mjs";
import { messageReceiptDigest } from "./messageIdentity.mjs";
import { emailTemplate } from "./templates.mjs";
export const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const generation = config => hash([config.mode, config.audience, config.since, config.from, config.studio, config.origin]);
const sources = { consultRequests: ["consult_studio", "consult_client"], membershipApplications: ["application_studio", "application_client"], notificationMessageReceipts: ["message_client"] };
const MAX_ATTEMPTS = 8;
// Resend retains idempotency keys for 24h. Stop at 23h; uncertain sends are
// held for reconciliation rather than risk another email after key expiry.
const SEND_WINDOW = 23 * 60 * 60 * 1000;
const LEASE = 60000;
export async function discoverNotifications(firestore, config, { limit = 100 } = {}) {
  firestore = fencedFirestore(firestore);
  if (config.mode === "off") return { discovered: 0 };
  let discovered = 0;
  for (const [collection, kinds] of Object.entries(sources)) {
    const cursorRef = firestore.doc(`notificationScanCursors/${hash([generation(config), collection])}`);
    const after = (await cursorRef.get()).data()?.after;
    let query = firestore.collection(collection).orderBy(FieldPath.documentId()).limit(limit);
    if (after) query = query.startAfter(after);
    const page = await query.get();
    for (const snapshot of page.docs) {
      // Server metadata, never caller-supplied createdAt. No historical backfill.
      if (snapshot.createTime.toMillis() < config.since) continue;
      for (const kind of kinds) {
        const targets = kind.endsWith("_studio") ? config.studio.map((_, index) => index) : [null];
        for (const target of targets) {
          const key = hash([generation(config), snapshot.ref.path, kind, target]);
          const ref = firestore.doc(`notificationQueue/${key}`);
          const created = await firestore.runTransaction(async tx => {
            if ((await tx.get(ref)).exists) return false;
            tx.create(ref, { kind, target, sourcePath: snapshot.ref.path, generation: generation(config), status: "queued", attempts: 0, deliveryAttempts: 0, nextAttemptAt: 0, createdAt: FieldValue.serverTimestamp() });
            return true;
          });
          if (created) discovered++;
        }
      }
    }
    // Cyclic pagination catches inserts with IDs earlier than the previous page.
    await cursorRef.set({ after: page.size === limit ? page.docs.at(-1).id : null });
  }
  return { discovered };
}
class Withheld extends Error {}
const withhold = reason => { throw new Withheld(reason); };
async function envelopeFor(firestore, auth, job, config) {
  const [collection, id, extra] = job.sourcePath.split("/");
  if (!sources[collection]?.includes(job.kind) || !id || extra) withhold("invalid_source");
  const snapshot = await firestore.doc(job.sourcePath).get();
  const source = snapshot.data();
  if (!source || snapshot.createTime.toMillis() < config.since) withhold("ineligible_source");
  const owner = source.clientUid;
  if (collection === "notificationMessageReceipts") {
    const [message, view, admin] = await Promise.all([
      firestore.doc(`messages/${id}`).get(), firestore.doc(`portalRecords/messages/records/${id}`).get(), firestore.doc(`adminUsers/${source.actorUid}`).get(),
    ]);
    const data = message.data();
    if (!data || source.messageId !== id || data.senderRole !== "admin" || data.senderUid !== source.actorUid || data.clientUid !== owner || admin.data()?.active !== true || view.data()?.clientUid !== owner || source.digest !== messageReceiptDigest(data)) withhold("untrusted_admin_message");
    const messagePolicy = await firestore.doc(`publicationRecords/messages/records/${id}`).get();
    if (!approvedSnapshot(messagePolicy.data(), view.data(), owner)) withhold("unreviewed_source");
    const actor = await auth.getUser(source.actorUid);
    if (actor.disabled) withhold("inactive_sender");
    const [conversation, conversationView] = await Promise.all([firestore.doc(`conversations/${data.conversationId}`).get(), firestore.doc(`portalRecords/conversations/records/${data.conversationId}`).get()]);
    const conversationPolicy = await firestore.doc(`publicationRecords/conversations/records/${data.conversationId}`).get();
    if (conversation.data()?.clientUid !== owner || !approvedSnapshot(conversationPolicy.data(), conversationView.data(), owner)) withhold("conversation_owner_mismatch");
  } else {
    const view = await firestore.doc(`portalRecords/${collection}/records/${id}`).get();
    const policy = await firestore.doc(`publicationRecords/${collection}/records/${id}`).get();
    if (!approvedSnapshot(policy.data(), view.data(), owner)) withhold("unreviewed_source");
  }
  if (typeof owner !== "string" || !owner || owner.includes("/")) withhold("uncertain_owner");
  const user = await auth.getUser(owner);
  if (user.disabled) withhold("disabled_owner");
  let to;
  if (job.kind.endsWith("_studio")) {
    to = config.studio[job.target];
  } else {
    // An intake email field is not proof that the account controls that address.
    if (!user.emailVerified || !address(user.email)) withhold("verified_email_required");
    to = user.email;
  }
  if (!address(to)) withhold("invalid_recipient");
  if (config.mode === "test" && !to.endsWith("@example.test")) withhold("synthetic_recipient_required");
  if (config.mode === "resend" && config.audience === "staging") to = "delivered@resend.dev";
  return { from: config.from, to: [to], ...emailTemplate(job.kind, config.origin) };
}
async function settle(firestore, ref, lease, patch) {
  await firestore.runTransaction(async tx => {
    const latest = await tx.get(ref);
    if (latest.data()?.lease !== lease || latest.data()?.status !== "sending") return;
    tx.update(ref, { ...patch, lease: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  });
}
export async function processNotifications(firestore, auth, config, transport, { now = Date.now(), limit = 20, deadline = Date.now() + 40000 } = {}) {
  firestore = fencedFirestore(firestore);
  if (config.mode === "off") return { attempted: 0 };
  const page = await firestore.collection("notificationQueue").where("nextAttemptAt", "<=", now).orderBy("nextAttemptAt").limit(limit).get();
  let attempted = 0;
  for (const snapshot of page.docs) {
    if (Date.now() >= deadline) break;
    const ref = snapshot.ref;
    const lease = randomUUID();
    const job = await firestore.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (!data || data.nextAttemptAt > now || !["queued", "retry", "sending"].includes(data.status)) return null;
      if (data.deliveryAttempts >= MAX_ATTEMPTS || data.attempts >= 16 || data.generation !== generation(config) || (data.firstDeliveryAt != null && now - data.firstDeliveryAt >= SEND_WINDOW)) {
        tx.update(ref, { status: "held", reason: data.generation !== generation(config) ? "configuration_changed" : data.deliveryAttempts >= MAX_ATTEMPTS || data.attempts >= 16 ? "retry_limit_review_required" : "idempotency_window_expired", nextAttemptAt: FieldValue.delete() });
        return null;
      }
      tx.update(ref, { status: "sending", lease, attempts: data.attempts + 1, nextAttemptAt: now + LEASE });
      return data;
    });
    if (!job) continue;
    attempted++;
    try {
      const permit = await assertServerWritesOpen(firestore);
      const envelope = await envelopeFor(firestore, auth, job, config);
      const digest = hash(envelope);
      if (job.envelopeHash && digest !== job.envelopeHash) withhold("delivery_identity_changed");
      // Persist the first send time and payload digest BEFORE external side effects.
      // Even a worker crash consumes the bounded provider idempotency window.
      const recipientHash = hash(envelope.to);
      if ((await firestore.doc(`notificationSuppressions/${recipientHash}`).get()).exists) withhold("recipient_suppressed");
      const ready = await firestore.runTransaction(async tx => {
        const latest = (await tx.get(ref)).data();
        if (latest?.lease !== lease || latest.status !== "sending") return false;
        if (latest.envelopeHash && latest.envelopeHash !== digest) withhold("delivery_identity_changed");
        tx.update(ref, { firstDeliveryAt: latest.firstDeliveryAt ?? now, envelopeHash: digest, recipientHash, deliveryAttempts: latest.deliveryAttempts + 1 });
        return true;
      });
      if (!ready) continue;
      await assertServerWritesOpen(firestore, permit.epoch);
      const result = await transport(envelope, ref.id);
      if (!result || typeof result.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(result.id)) throw new Error("ambiguous_provider_result");
      await settle(firestore, ref, lease, { status: config.mode === "test" ? "test_delivered" : "accepted", providerId: result.id, reason: FieldValue.delete(), nextAttemptAt: FieldValue.delete() });
    } catch (error) {
      const withheld = error instanceof Withheld || error.code === "auth/user-not-found";
      const exhausted = job.deliveryAttempts + 1 >= MAX_ATTEMPTS || job.attempts + 1 >= 16;
      const permanent = error.permanent === true;
      // Never persist raw provider errors, addresses, source text or response bodies.
      await settle(firestore, ref, lease, { status: withheld ? "held" : permanent ? "failed" : exhausted ? "held" : "retry", reason: withheld ? (error instanceof Withheld ? error.message : "unknown_owner") : permanent ? "provider_rejected" : exhausted ? "retry_limit_review_required" : "temporary_or_uncertain_delivery", nextAttemptAt: withheld || permanent || exhausted ? FieldValue.delete() : now + Math.min(3600000, 30000 * 2 ** job.deliveryAttempts) });
    }
  }
  return { attempted };
}
