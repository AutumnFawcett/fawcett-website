import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeApp as initBrowser, deleteApp as deleteBrowser } from "firebase/app";
import { getAuth as browserAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, reload } from "firebase/auth";
import { getFirestore as browserDb, connectFirestoreEmulator, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { firebaseEnvironment, DEMO_PROJECT_ID } from "../../lib/firebaseEnvironment.mjs";
import { notificationConfig } from "../../lib/notifications/config.mjs";
import { discoverNotifications, processNotifications, hash, } from "../../lib/notifications/queue.mjs";
import { sendAdminMessage, handleAdminMessage } from "../../lib/notifications/adminMessages.mjs";
import { approveConfigurationGeneration, runNotifications } from "../../lib/notifications/worker.mjs";
import { handleResendWebhook } from "../../lib/notifications/webhook.mjs";
import { verifyFirebaseBearerToken } from "../../lib/payments/firebaseBearerAuth.js";
import { addDoc as adminAddDoc } from "../../lib/adminFirestore.js";
import { addDoc as clientAddDoc, collection as portalCollection } from "../../lib/portalFirestore.js";
let app, db, auth, browser, ba, bd, config, tokens;
const password = "Synthetic-only-123!", adminUid = "notifications-admin", clientUid = "notifications-client";
const authenticate = request => verifyFirebaseBearerToken(request, auth.verifyIdToken.bind(auth));
const request = (input, uid = adminUid) => handleAdminMessage(new Request("http://localhost/api/admin/messages", { method: "POST", headers: { "Content-Type": "application/json", ...(uid ? { Authorization: `Bearer ${tokens[uid] || "invalid"}` } : {}) }, body: JSON.stringify(input) }), { firestore: db, authenticate });
async function seed(collectionName = "consultRequests", id = "synthetic-intake", patch = {}, view = true) {
  const data = { clientUid, clientEmail: "FORGED-RECIPIENT@external.example", createdAt: Timestamp.fromMillis(0), adminReview: { internalNotes: "SYNTHETIC PRIVATE HEALTH NOTE" }, ...patch };
  await db.doc(`${collectionName}/${id}`).set(data);
  if (view) {
    await db.doc(`portalRecords/${collectionName}/records/${id}`).set({ clientUid: data.clientUid });
    await db.doc(`publicationRecords/${collectionName}/records/${id}`).set({ schemaVersion: 1, state: "approved", approved: { clientUid: data.clientUid } });
  }
  return data;
}
const jobs = async () => (await db.collection("notificationQueue").get()).docs;
async function discover() { await discoverNotifications(db, config); return jobs(); }
async function processJobs(transport = async (_envelope, id) => ({ id: `synthetic_${id}` }), options = {}) { return processNotifications(db, auth, config, transport, options); }
async function oneClientJob() {
  await seed(); const all = await discover();
  const client = all.find(s => s.data().kind === "consult_client");
  for (const job of all) if (job.id !== client.id) await job.ref.delete();
  return client.ref;
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  app = initializeApp({ projectId: DEMO_PROJECT_ID }, "notification-tests"); db = getFirestore(app); auth = getAuth(app);
  browser = initBrowser(firebaseEnvironment().config, "notifications-browser"); ba = browserAuth(browser); connectAuthEmulator(ba, "http://127.0.0.1:9099", { disableWarnings: true }); bd = browserDb(browser); connectFirestoreEmulator(bd, "127.0.0.1", 8080);
  tokens = {};
  for (const uid of [adminUid, clientUid, "notifications-inactive", "notifications-other", "notifications-unverified"]) {
    await auth.createUser({ uid, email: `${uid}@example.test`, password, emailVerified: uid !== "notifications-unverified" });
    await signInWithEmailAndPassword(ba, `${uid}@example.test`, password); tokens[uid] = await ba.currentUser.getIdToken();
  }
});
beforeEach(async () => {
  const cleared = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" }); assert.ok(cleared.ok);
  await db.doc("systemControls/writeFence").set({ schemaVersion: 1, state: "open", epoch: "test", writerProtocol: 1 });
  await db.doc(`adminUsers/${adminUid}`).set({ active: true }); await db.doc("adminUsers/notifications-inactive").set({ active: false });
  config = notificationConfig({ NOTIFICATIONS_MODE: "test", NOTIFICATION_ACTIVATED_AT: new Date(Date.now() - 1000).toISOString() });
});
after(async () => { await deleteBrowser(browser); await deleteApp(app); });

test("new consult and membership submissions produce studio and verified-client emails with no private contents", async () => {
  await seed(); await seed("membershipApplications", "synthetic-application");
  const originals = await db.doc("consultRequests/synthetic-intake").get();
  await discover(); const sent = [];
  await processJobs(async (envelope, id) => { sent.push(envelope); return { id }; });
  assert.equal(sent.length, 4);
  assert.equal(sent.filter(e => e.to[0] === `${clientUid}@example.test`).length, 2);
  assert.doesNotMatch(JSON.stringify(sent), /FORGED|HEALTH|internalNotes|clientUid|synthetic-intake/);
  assert.deepEqual((await db.doc("consultRequests/synthetic-intake").get()).data(), originals.data());
  assert.ok((await jobs()).every(s => s.data().status === "test_delivered"));
});
test("Firestore event rediscovery and concurrent workers send each notification once", async () => {
  await seed(); await Promise.all([discover(), discover()]); assert.equal((await jobs()).length, 2);
  let sent = 0;
  const transport = async (_envelope, id) => { sent++; return { id }; };
  await Promise.all([processJobs(transport), processJobs(transport)]); await discover(); await processJobs(transport);
  assert.equal(sent, 2);
});
test("cyclic cursor finds inserts earlier than previous page without dropping or duplicating notifications", async () => {
  await seed("consultRequests", "z-last"); await discoverNotifications(db, config, { limit: 1 });
  await seed("consultRequests", "a-first");
  for (let round = 0; round < 4; round++) await discoverNotifications(db, config, { limit: 1 });
  assert.equal((await jobs()).length, 4);
});
test("authoritative creation watermark excludes old records and projection backfills", async () => {
  await seed(); const old = await db.doc("consultRequests/synthetic-intake").get();
  config = { ...config, since: old.createTime.toMillis() + 1 };
  await db.doc("portalRecords/consultRequests/records/synthetic-intake").set({ clientUid });
  await discover(); assert.equal((await jobs()).length, 0);
});
test("unreviewed records, unknown ownership and unverified client email fail closed", async () => {
  await seed("consultRequests", "legacy", {}, false);
  await seed("consultRequests", "unknown", { clientUid: "missing-auth-user" });
  await seed("consultRequests", "unverified", { clientUid: "notifications-unverified" });
  const sent = []; await discover(); await processJobs(async (e, id) => { sent.push(e); return { id }; });
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].to, ["studio@example.test"]);
  assert.ok((await jobs()).some(s => s.data().reason === "verified_email_required"));
  assert.ok((await jobs()).filter(s => s.data().sourcePath.endsWith("legacy")).every(s => s.data().reason === "unreviewed_source"));
});
test("provider outage preserves received consultation and retries with bounded backoff", async () => {
  const ref = await oneClientJob(), now = Date.now();
  await processJobs(async () => { throw new Error("SENSITIVE provider response"); }, { now });
  let job = (await ref.get()).data(); assert.equal(job.status, "retry"); assert.equal(job.nextAttemptAt, now + 30000);
  assert.ok((await db.doc("consultRequests/synthetic-intake").get()).exists);
  assert.doesNotMatch(JSON.stringify(job), /SENSITIVE|@|HEALTH/);
  let sent = 0; const transport = async () => { sent++; return { id: "synthetic-recovered" }; };
  await processJobs(transport, { now: now + 29999 }); assert.equal(sent, 0);
  await processJobs(transport, { now: now + 30000 }); assert.equal(sent, 1); assert.equal((await ref.get()).data().status, "test_delivered");
});
test("ambiguous provider acceptance retries the identical payload and key; provider emits only once", async () => {
  const ref = await oneClientJob(), now = Date.now(), cache = new Map(); let calls = 0;
  const transport = async (envelope, id) => {
    calls++;
    if (cache.has(id)) { assert.deepEqual(envelope, cache.get(id)); return { id: "synthetic-accepted" }; }
    cache.set(id, envelope); throw new Error("synthetic timeout after acceptance");
  };
  await processJobs(transport, { now }); await processJobs(transport, { now: now + 30000 }); await discover(); await processJobs(transport, { now: now + 60000 });
  // Rediscovery also recreates the removed studio test job; count only this key.
  assert.equal(cache.has(ref.id), true); assert.equal((await ref.get()).data().deliveryAttempts, 2);
  assert.equal(cache.size, 2); assert.equal(calls, 3);
});
test("expired provider idempotency window and exhausted attempts hold for manual reconciliation", async () => {
  const ref = await oneClientJob(), now = Date.now();
  await ref.update({ status: "sending", firstDeliveryAt: now - 23 * 3600000, nextAttemptAt: 0 });
  let sent = 0; await processJobs(async () => { sent++; return { id: "bad" }; }, { now });
  assert.equal(sent, 0); assert.equal((await ref.get()).data().reason, "idempotency_window_expired");
  await ref.update({ status: "retry", firstDeliveryAt: now, deliveryAttempts: 7, nextAttemptAt: 0 });
  await processJobs(async () => { throw new Error("outage"); }, { now });
  assert.equal((await ref.get()).data().reason, "retry_limit_review_required");
});
test("expired worker lease recovers safely; changed identity and activation generation are held", async () => {
  const ref = await oneClientJob(), now = Date.now();
  await ref.update({ status: "sending", lease: "crashed-worker", nextAttemptAt: now - 1 });
  await processJobs(async () => { throw new Error("timeout"); }, { now });
  await auth.updateUser(clientUid, { email: "changed@example.test", emailVerified: true });
  try { await processJobs(undefined, { now: now + 30000 }); assert.equal((await ref.get()).data().reason, "delivery_identity_changed"); }
  finally { await auth.updateUser(clientUid, { email: `${clientUid}@example.test`, emailVerified: true }); }
  await ref.update({ status: "retry", nextAttemptAt: 0, generation: "different-activation" });
  await processJobs(); assert.equal((await ref.get()).data().reason, "configuration_changed");
});
test("permanent provider rejection is terminal and stores only a sanitized reason", async () => {
  const ref = await oneClientJob();
  await processJobs(async () => { const error = new Error("secret response"); error.permanent = true; throw error; });
  const job = (await ref.get()).data(); assert.equal(job.status, "failed"); assert.equal(job.reason, "provider_rejected"); assert.equal(job.nextAttemptAt, undefined);
});
test("forged client/admin notification requests and sender fields cannot create messages or queue records", async () => {
  await seed("conversations", "synthetic-conversation");
  const input = { id: "synthetic-message", conversationId: "synthetic-conversation", body: "Synthetic reply" };
  for (const uid of [null, "invalid", clientUid, "notifications-inactive"]) assert.equal((await request(input, uid)).status, 403);
  for (const patch of [{ to: "arbitrary@external.example" }, { senderUid: clientUid }, { clientUid: "notifications-other" }, { id: "../bad" }, { body: "" }]) assert.equal((await request({ ...input, ...patch })).status, 403);
  assert.equal((await db.collection("messages").get()).size, 0); assert.equal((await jobs()).length, 0);
});
test("authorized admin reply atomically preserves ownership, creates projection and trusted receipt, and is idempotent", async () => {
  await seed("consultRequests", "linked-consult"); await seed("conversations", "synthetic-conversation", { consultRequestId: "linked-consult", sourceType: "consultRequest", sourceId: "linked-consult" });
  const input = { id: "synthetic-message", conversationId: "synthetic-conversation", body: "PRIVATE SYNTHETIC MESSAGE BODY" };
  assert.equal((await request(input)).status, 200); assert.equal((await request(input)).status, 200);
  const message = (await db.doc("messages/synthetic-message").get()).data(); assert.equal(message.senderUid, adminUid); assert.equal(message.consultRequestId, "linked-consult"); assert.equal(message.sourceId, "linked-consult"); assert.equal(message.sourceType, "consultRequest");
  assert.equal((await db.doc("portalRecords/messages/records/synthetic-message").get()).data().body, input.body);
  assert.equal((await db.doc("conversations/synthetic-conversation").get()).data().unreadForClient, true);
  assert.equal((await request({ ...input, body: "changed body" })).status, 403);
  const sent = []; await discover(); await processJobs(async (e, id) => { sent.push(e); return { id }; });
  assert.equal(sent.filter(e => e.subject === "You have a new Tattoo Portal message").length, 1);
  assert.doesNotMatch(JSON.stringify(sent), /PRIVATE SYNTHETIC MESSAGE BODY|HEALTH/);
});
test("legacy conversation without a reviewed projection and cross-owner linked records cannot receive new server replies", async () => {
  const input = { id: "synthetic-message", conversationId: "legacy", body: "Synthetic reply" };
  await seed("conversations", "legacy", {}, false); assert.equal((await request(input)).status, 403);
  await seed("consultRequests", "other-consult", { clientUid: "notifications-other" });
  await seed("conversations", "legacy", { consultRequestId: "other-consult" }); assert.equal((await request(input)).status, 403);
  await db.doc("portalRecords/conversations/records/legacy").update({ clientUid: "notifications-other" }); assert.equal((await request(input)).status, 403);
  assert.equal((await db.collection("messages").get()).size, 0);
});
test("forged direct messages are never discovered; revoked admin sender and disabled client stop delivery", async () => {
  await seed("conversations", "synthetic-conversation");
  await seed("messages", "forged-direct-message", { senderUid: adminUid, senderRole: "admin", conversationId: "synthetic-conversation", body: "Forged" });
  await discover(); assert.equal((await jobs()).length, 0);
  await sendAdminMessage(db, adminUid, { id: "trusted-message", conversationId: "synthetic-conversation", body: "Synthetic reply" });
  await discover(); await db.doc(`adminUsers/${adminUid}`).update({ active: false });
  await processJobs(); assert.equal((await jobs())[0].data().reason, "untrusted_admin_message");
  await seed(); await discover(); await auth.updateUser(clientUid, { disabled: true });
  try { await processJobs(); assert.ok((await jobs()).some(s => s.data().reason === "disabled_owner")); }
  finally { await auth.updateUser(clientUid, { disabled: false }); }
});
test("shared admin addDoc helper routes existing reply call patterns through authenticated server and returns Firebase reference", async () => {
  await signInWithEmailAndPassword(ba, `${adminUid}@example.test`, password);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/admin/messages") return handleAdminMessage(new Request("http://localhost/api/admin/messages", options), { firestore: db, authenticate });
    return originalFetch(url, options);
  };
  try {
    const relations = [null, "applicationId", "consultRequestId", "membershipChangeRequestId", "membershipOfferResponseId"];
    const collections = { applicationId: "membershipApplications", consultRequestId: "consultRequests", membershipChangeRequestId: "membershipChangeRequests", membershipOfferResponseId: "membershipOfferResponses" };
    for (let index = 0; index < relations.length; index++) {
      const key = relations[index], conv = `helper-conversation-${index}`;
      if (key) await seed(collections[key], `linked-${index}`);
      await seed("conversations", conv, key ? { [key]: `linked-${index}` } : {});
      const ref = await adminAddDoc(collection(bd, "messages"), { conversationId: conv, clientUid, senderUid: adminUid, senderRole: "admin", body: `Synthetic admin reply ${index}` });
      assert.equal(ref.path, `messages/${ref.id}`); assert.equal((await db.doc(ref.path).get()).data().conversationId, conv);
    }
  } finally { globalThis.fetch = originalFetch; }
  assert.equal((await db.collection("notificationMessageReceipts").get()).size, 5);
});
test("client SDK submission and client messaging still work while notification delivery is off", async () => {
  await signInWithEmailAndPassword(ba, `${clientUid}@example.test`, password);
  const intake = await clientAddDoc(portalCollection(bd, "consultRequests"), { clientUid, clientEmail: `${clientUid}@example.test`, clientName: "Synthetic Client", status: "new", readiness: { healthNotes: "Synthetic private health" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  assert.equal((await db.doc(intake.path).get()).data().clientUid, clientUid);
  assert.ok((await db.doc(`portalRecords/consultRequests/records/${intake.id}`).get()).exists);
  const conv = await clientAddDoc(portalCollection(bd, "conversations"), { clientUid, consultRequestId: intake.id, status: "new", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const message = await clientAddDoc(portalCollection(bd, "messages"), { clientUid, conversationId: conv.id, consultRequestId: intake.id, senderUid: clientUid, senderRole: "client", senderName: "Synthetic Client", body: "Synthetic client reply", createdAt: serverTimestamp() });
  assert.ok((await db.doc(message.path).get()).exists);
  await discoverNotifications(db, { mode: "off" }); assert.equal((await jobs()).length, 0);
});
test("queue, receipts, cursors, webhook logs and suppressions deny every browser role reads/writes", async () => {
  const paths = ["notificationQueue/forged", "notificationMessageReceipts/forged", "notificationScanCursors/forged", "notificationWebhookEvents/forged", "notificationSuppressions/forged", "notificationConfiguration/current"];
  for (const uid of [null, clientUid, "notifications-other", "notifications-inactive", adminUid]) {
    if (uid) await signInWithEmailAndPassword(ba, `${uid}@example.test`, password); else await signOut(ba);
    for (const path of paths) {
      const ref = doc(bd, path);
      for (const operation of [() => getDoc(ref), () => setDoc(ref, { status: "queued", to: "forged@external.example" }), () => updateDoc(ref, { status: "queued" }), () => deleteDoc(ref)]) await assert.rejects(operation(), { code: "permission-denied" });
      await assert.rejects(getDocs(collection(bd, path.split("/")[0])), { code: "permission-denied" });
    }
  }
});
const webhookSecret = `whsec_${Buffer.alloc(32, 2).toString("base64")}`;
function webhook(type, providerId, eventId = "synthetic-event", tamper = false) {
  const raw = JSON.stringify({ type, data: { email_id: providerId, subject: "SENSITIVE OMITTED", to: ["not-stored@example.test"] } }), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", Buffer.alloc(32, 2)).update(`${eventId}.${timestamp}.${raw}`).digest("base64");
  return handleResendWebhook(new Request("http://localhost/api/webhooks/resend", { method: "POST", headers: { "svix-id": eventId, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }, body: tamper ? raw + " " : raw }), db, { secret: webhookSecret });
}
test("signed webhooks deduplicate, track real delivery vs acceptance, preserve bounce precedence and suppress further sends", async () => {
  const ref = await oneClientJob();
  await ref.update({ status: "accepted", providerId: "synthetic-provider-id", recipientHash: hash([`${clientUid}@example.test`]) });
  assert.equal((await webhook("email.delivered", "synthetic-provider-id", "delivery", true)).status, 400);
  assert.equal((await webhook("email.delivered", "synthetic-provider-id", "delivery")).status, 200);
  assert.equal((await webhook("email.delivered", "synthetic-provider-id", "delivery")).status, 200);
  assert.equal((await ref.get()).data().status, "delivered");
  assert.equal((await webhook("email.bounced", "synthetic-provider-id", "bounce")).status, 200);
  await webhook("email.delivered", "synthetic-provider-id", "late-delivery"); assert.equal((await ref.get()).data().status, "bounced");
  const logs = await db.collection("notificationWebhookEvents").get(); assert.equal(logs.size, 3); assert.doesNotMatch(JSON.stringify(logs.docs.map(s => s.data())), /SENSITIVE|not-stored|@/);
  await seed("consultRequests", "second-intake"); await discover(); await processJobs();
  assert.ok((await jobs()).some(s => s.data().reason === "recipient_suppressed"));
});
test("webhook before durable provider acceptance requests retry without guessing a recipient or marking delivery", async () => {
  assert.equal((await webhook("email.delivered", "unknown-provider")).status, 503);
  assert.equal((await db.collection("notificationWebhookEvents").get()).size, 0);
});
test("staging routes every recipient to Resend's fixed test sink (injected transport, no network)", async () => {
  await seed(); config = { ...config, mode: "resend", audience: "staging" }; await discover();
  const sent = []; await processJobs(async (e, id) => { sent.push(e); return { id }; });
  assert.equal(sent.length, 2); assert.ok(sent.every(e => e.to[0] === "delivered@resend.dev"));
  assert.ok((await jobs()).every(s => s.data().status === "accepted"));
});

test("changing sender, audience or recipient configuration requires a fresh activation fence", async () => {
  const now = Date.now();
  await approveConfigurationGeneration(db, config, now);
  await approveConfigurationGeneration(db, config, now + 1);
  await assert.rejects(approveConfigurationGeneration(db, { ...config, audience: "live" }, now + 2), /new_activation_watermark_required/);
  await approveConfigurationGeneration(db, { ...config, audience: "live", since: now + 3 }, now + 2);
});

test("a crash after the final provider attempt cannot cause a ninth send", async () => {
  const ref = await oneClientJob();
  await ref.update({ status: "sending", deliveryAttempts: 8, firstDeliveryAt: Date.now(), nextAttemptAt: 0 });
  let calls = 0;
  await processJobs(async () => { calls++; return { id: "ninth-attempt" }; });
  assert.equal(calls, 0); assert.equal((await ref.get()).data().reason, "retry_limit_review_required");
});

test("scheduled worker composes safe configuration, discovery and local sink; off performs no database work", async () => {
  const unavailable = new Proxy({}, { get() { throw new Error("must not access disabled service"); } });
  assert.deepEqual(await runNotifications(unavailable, unavailable, { NOTIFICATIONS_MODE: "off" }), { disabled: true });
  await seed();
  const env = { NOTIFICATIONS_MODE: "test", NOTIFICATION_ACTIVATED_AT: new Date(config.since).toISOString() };
  const result = await runNotifications(db, auth, env);
  assert.deepEqual(result, { discovered: 2, attempted: 2 });
  assert.ok((await jobs()).every(s => s.data().status === "test_delivered" && s.data().providerId.startsWith("test_")));
  assert.deepEqual(await runNotifications(db, auth, env), { discovered: 0, attempted: 0 });
});

test("all five admin workflows preserve selected record links when reusing existing conversations", async () => {
  const cases = [
    { workflow: "AdminInbox", key: "consultRequestId", collection: "consultRequests", type: "consultRequest", existing: true },
    ...[["consultRequestId", "consultRequests", "consult"], ["applicationId", "membershipApplications", "application"], ["membershipOfferResponseId", "membershipOfferResponses", "offer_response"], ["membershipChangeRequestId", "membershipChangeRequests", "membership_request"]].map(([key, collection, type]) => ({ workflow: "AdminIntakeDashboard", key, collection, type })),
    { workflow: "AdminMembershipRequests", key: "membershipChangeRequestId", collection: "membershipChangeRequests", type: "membershipChangeRequest" },
    { workflow: "AdminMembershipOffers", key: "applicationId", collection: "membershipApplications", type: "membershipApplication" },
    { workflow: "AdminMembershipOfferResponses", key: "membershipOfferResponseId", collection: "membershipOfferResponses", type: "membershipOfferResponse" },
  ];
  await signInWithEmailAndPassword(ba, `${adminUid}@example.test`, password);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => url === "/api/admin/messages" ? handleAdminMessage(new Request("http://localhost/api/admin/messages", options), { firestore: db, authenticate }) : originalFetch(url, options);
  try {
    for (let index = 0; index < cases.length; index++) {
      const item = cases[index], linkedId = `selected-${index}`, conversationId = `selected-conversation-${index}`;
      await seed("membershipApplications", `application-${index}`);
      await seed(item.collection, linkedId, item.key === "membershipOfferResponseId" ? { applicationId: `application-${index}` } : {});
      const base = item.key === "membershipOfferResponseId" ? { applicationId: `application-${index}` } : {};
      await seed("conversations", conversationId, { ...base, ...(item.existing ? { [item.key]: linkedId } : {}) });
      const ref = await adminAddDoc(collection(bd, "messages"), { conversationId, clientUid, senderUid: adminUid, senderRole: "admin", body: `Synthetic ${item.workflow} reply`, ...base, [item.key]: linkedId, sourceType: item.type, sourceId: linkedId });
      const message = (await db.doc(ref.path).get()).data();
      assert.equal(message[item.key], linkedId, item.workflow); assert.equal(message.sourceId, linkedId); assert.equal(message.sourceType, item.type);
      if (base.applicationId) assert.equal(message.applicationId, base.applicationId);
      assert.equal((await db.doc(`portalRecords/messages/records/${ref.id}`).get()).data()[item.key], linkedId);
    }
  } finally { globalThis.fetch = originalFetch; }
  // The combined intake/message fixtures exceed one 20-job worker batch.
  await discover(); await processJobs(); await processJobs();
  assert.equal((await jobs()).filter(job => job.data().kind === "message_client" && job.data().status === "test_delivered").length, cases.length);
});

test("reply relationships reject other owners, conflicting conversations and a response from another application", async () => {
  await seed("membershipApplications", "app-one"); await seed("membershipApplications", "app-two");
  await seed("conversations", "linked-conversation", { applicationId: "app-one" });
  await seed("membershipOfferResponses", "other-owner", { clientUid: "notifications-other", applicationId: "app-one" });
  await seed("membershipOfferResponses", "wrong-application", { applicationId: "app-two" });
  const input = { id: "invalid-associated-reply", conversationId: "linked-conversation", body: "Synthetic reply" };
  for (const relationships of [{ applicationId: "app-two" }, { membershipOfferResponseId: "other-owner" }, { membershipOfferResponseId: "wrong-application" }, { to: "arbitrary@example.test" }]) assert.equal((await request({ ...input, relationships })).status, 403);
  assert.equal((await request({ ...input, sourceType: "consult", sourceId: "app-one" })).status, 403);
  assert.equal((await db.doc("messages/invalid-associated-reply").get()).exists, false);
});

test("new password signup is unverified; verified ownership enables future notices without automatically releasing held mail", async () => {
  const credential = await createUserWithEmailAndPassword(ba, "new-unverified@example.test", password);
  const uid = credential.user.uid;
  assert.equal(credential.user.emailVerified, false);
  await seed("consultRequests", "before-verification", { clientUid: uid }); await discover(); await processJobs();
  const held = (await jobs()).find(job => job.data().kind === "consult_client");
  assert.equal(held.data().reason, "verified_email_required");
  // Synthetic emulator owner verification only; no verification email is sent.
  await auth.updateUser(uid, { emailVerified: true }); await reload(credential.user);
  assert.equal(credential.user.emailVerified, true);
  await seed("consultRequests", "after-verification", { clientUid: uid }); await discover(); await processJobs();
  assert.equal((await held.ref.get()).data().status, "held");
  assert.ok((await jobs()).some(job => job.data().kind === "consult_client" && job.data().sourcePath.endsWith("after-verification") && job.data().status === "test_delivered"));
});
