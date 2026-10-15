import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeApp as browserApp, deleteApp as deleteBrowser } from "firebase/app";
import { getAuth as browserAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore as browserDb, connectFirestoreEmulator, doc, collection, getDocFromServer, getDocsFromServer, query, where, setDoc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { firebaseEnvironment, DEMO_PROJECT_ID } from "../../lib/firebaseEnvironment.mjs";
import { OPEN_EMULATOR_FENCE, WRITE_FENCE_PATH, writesOpen } from "../../lib/safety/writeFence.mjs";
import { fencedFirestore, assertServerWritesOpen } from "../../lib/safety/serverFence.mjs";
import { assertBrowserWritesOpen } from "../../lib/safety/browserFence.js";
import { reviewPublication, withdrawPublication } from "../../lib/safety/publication.mjs";
import * as portal from "../../lib/portalFirestore.js";
import * as admin from "../../lib/adminFirestore.js";
import { saveStudioClient } from "../../lib/clients/clientService.mjs";
import { sendAdminMessage } from "../../lib/notifications/adminMessages.mjs";
import { handleVerification } from "../../lib/verification/server.mjs";
import { discoverNotifications, processNotifications } from "../../lib/notifications/queue.mjs";
import { notificationConfig } from "../../lib/notifications/config.mjs";
let app, db, guarded, auth, browser, ba, bd, token;
const uid = "safety-alice", staff = "safety-admin", password = "Synthetic-only-123!";
const open = () => db.doc(WRITE_FENCE_PATH).set(OPEN_EMULATOR_FENCE);
const close = () => db.doc(WRITE_FENCE_PATH).set({ ...OPEN_EMULATOR_FENCE, state: "maintenance", epoch: "closed-2" });
const identity = { clientUid: uid, clientName: "Synthetic Alice", clientEmail: `${uid}@example.test` };
const dates = () => ({ createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const consult = () => ({ ...identity, ...dates(), status: "new", readiness: { healthNotes: "Synthetic private detail" }, request: { tattooIdea: "Synthetic fern" } });
const studio = { name: "Synthetic Walk In", email: "walkin@example.test", phone: "5551234567", instagram: "", preferredArtist: "ben", status: "lead", studioNotes: "Synthetic private studio note" };
async function publish(path, fields) {
  const review = await reviewPublication(db, auth, staff, { path });
  return reviewPublication(db, auth, staff, { path, sourceHash: review.sourceHash, fields: fields || Object.keys(review.candidate), reviewed: true }, true);
}
async function seedConversation() {
  await db.doc("conversations/thread").set({ ...identity, subject: "Synthetic conversation", lastMessagePreview: "Approved preview", unreadForAdmin: false, unreadForClient: false, lastMessageAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await publish("conversations/thread");
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  app = initializeApp({ projectId: DEMO_PROJECT_ID }, "safety-tests"); db = getFirestore(app); auth = getAuth(app); guarded = fencedFirestore(db);
  browser = browserApp(firebaseEnvironment().config, "safety-browser"); ba = browserAuth(browser); bd = browserDb(browser);
  connectAuthEmulator(ba, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(bd, "127.0.0.1", 8080);
  for (const id of [uid, staff, "safety-bob"]) await auth.createUser({ uid: id, email: `${id}@example.test`, password });
});
beforeEach(async () => {
  assert.ok((await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" })).ok);
  await open(); await db.doc(`adminUsers/${staff}`).set({ active: true });
  await signInWithEmailAndPassword(ba, `${uid}@example.test`, password); token = await ba.currentUser.getIdToken();
});
after(async () => { await deleteBrowser(browser); await deleteApp(app); });

for (const [name, state] of [["missing", null], ["closed", { ...OPEN_EMULATOR_FENCE, state: "maintenance" }], ["invalid protocol", { ...OPEN_EMULATOR_FENCE, writerProtocol: 2 }], ["invalid epoch", { ...OPEN_EMULATOR_FENCE, epoch: "" }], ["newline epoch", { ...OPEN_EMULATOR_FENCE, epoch: "old\n" }], ["malformed", { state: "open" }]]) {
  test(`${name} fence rejects native SDK, modern client, and server mutations`, async () => {
    if (state) await db.doc(WRITE_FENCE_PATH).set(state); else await db.doc(WRITE_FENCE_PATH).delete();
    await assert.rejects(setDoc(doc(bd, "clients", uid), { ...identity, ...dates() }), { code: "permission-denied" });
    await assert.rejects(portal.setDoc(portal.doc(bd, "clients", uid), { ...identity, ...dates() }));
    await signInWithEmailAndPassword(ba, `${staff}@example.test`, password);
    await assert.rejects(setDoc(doc(bd, "projects/native-admin"), { ...identity, projectName: "Synthetic valid admin write" }), { code: "permission-denied" });
    await assert.rejects(guarded.doc("projects/fenced").set(identity), { code: "maintenance" });
    assert.equal((await db.doc("projects/fenced").get()).exists, false);
  });
}
test("SDK/REST cached-client writes cannot bypass maintenance, including active browser admins", async () => {
  await close();
  await signInWithEmailAndPassword(ba, `${staff}@example.test`, password);
  const adminToken = await ba.currentUser.getIdToken();
  const restWrite = () => fetch(`http://127.0.0.1:8080/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents/projects/cached-rest-admin`, { method: "PATCH", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { clientUid: { stringValue: uid }, projectName: { stringValue: "Synthetic valid REST write" } } }) });
  assert.equal((await restWrite()).status, 403);
  await assert.rejects(setDoc(doc(bd, "projects", "cached-admin"), identity), { code: "permission-denied" });
  await assert.rejects(setDoc(doc(bd, WRITE_FENCE_PATH), OPEN_EMULATOR_FENCE), { code: "permission-denied" });
  // The identical authenticated write is valid when open: its closed failure
  // establishes the fence rather than an unrelated ownership/schema denial.
  await open(); assert.equal((await restWrite()).status, 200);
  await setDoc(doc(bd, "projects/native-admin"), { ...identity, projectName: "Synthetic valid admin write" });
});
test("maintenance preserves authenticated owned reads, sessions and source privacy", async () => {
  await db.doc("projects/project").set({ ...identity, projectName: "Approved design", adminReview: { internalNotes: "Synthetic private note" } }); await publish("projects/project");
  await close();
  assert.equal((await getDocFromServer(portal.doc(bd, "projects", "project"))).data().projectName, "Approved design");
  await assert.rejects(getDocFromServer(doc(bd, "projects", "project")), { code: "permission-denied" });
  assert.equal((await auth.verifyIdToken(token)).uid, uid);
  await signInWithEmailAndPassword(ba, "safety-bob@example.test", password);
  await assert.rejects(getDocFromServer(portal.doc(bd, "projects", "project")), { code: "permission-denied" });
  await signOut(ba); await assert.rejects(getDocFromServer(portal.doc(bd, "projects", "project")), { code: "permission-denied" });
});
test("reopening rejects source-only cached submissions and forged pair/view approvals", async () => {
  await close(); await open();
  await assert.rejects(setDoc(doc(bd, "consultRequests", "legacy"), consult()), { code: "permission-denied" });
  const batch = writeBatch(bd); batch.set(doc(bd, "consultRequests", "incomplete"), consult()); batch.set(portal.doc(bd, "consultRequests", "incomplete"), identity);
  await assert.rejects(batch.commit(), { code: "permission-denied" });
  assert.equal((await db.doc("consultRequests/incomplete").get()).exists, false);
  await assert.rejects(setDoc(portal.doc(bd, "projects", "forged"), identity), { code: "permission-denied" });
});
test("new profile and consult source/view/approval triples commit only for their own Auth UID", async () => {
  await portal.setDoc(portal.doc(bd, "clients", uid), { ...identity, ...dates() });
  const ref = await portal.addDoc(portal.collection(bd, "consultRequests"), consult());
  assert.equal((await getDocFromServer(ref)).data().readiness, undefined);
  assert.equal((await db.doc(`consultRequests/${ref.id}`).get()).data().readiness.healthNotes, "Synthetic private detail");
  assert.equal((await db.doc(`publicationRecords/consultRequests/records/${ref.id}`).get()).data().mode, "client_origin");
  await assert.rejects(portal.setDoc(portal.doc(bd, "clients", "safety-bob"), { ...identity, clientUid: "safety-bob", ...dates() }), { code: "permission-denied" });
});
async function intake(kind = "consult", invalid = false) {
  const submission = portal.createPortalSubmission(bd, { uid, kind });
  const source = kind === "consult" ? consult() : { ...identity, phone: "555-0100", instagram: "", ...dates(), programName: "Tattoo Project Membership Program", applicationType: "founding_member_interest", preferredContactMethod: "email", status: "new", preferredArtist: "not_sure", project: { projectType: "other", tattooIdea: "Synthetic fern", colourPreference: "not_sure", placement: "Arm", bodySide: "left", sizeCategory: "palm_sized", detailLevel: "moderate" }, coverUp: { isCoverUp: "no", coverUpDescription: "" }, budget: { tierInterest: "not_sure", monthlyComfort: "not_sure", paymentStyle: "not_sure" }, timeline: { planningTimeline: "planning_ahead", completionWindow: "artist_estimate", availability: "Weekdays" }, readiness: { readyForConsult: "yes", healthConsiderations: "yes", healthDetails: "Synthetic private detail" }, acknowledgements: Object.fromEntries(["applicationOnly", "noPaymentCollected", "noGuarantee", "notInvestmentLoanDiscount", "mandatoryCostsBeforeEnrollment", "termsBeforeEnrollment", "studioPolicy", "informationAccurate", "contactPermission"].map(key => [key, true])) };
  const record = await submission.addDoc(portal.collection(bd, kind === "consult" ? "consultRequests" : "membershipApplications"), source);
  const link = kind === "consult" ? { consultRequestId: record.id } : { applicationId: record.id };
  const conversation = await submission.addDoc(portal.collection(bd, "conversations"), { ...identity, ...dates(), ...link, subject: "Synthetic intake" });
  await submission.addDoc(portal.collection(bd, "messages"), { clientUid: invalid ? "safety-bob" : uid, conversationId: conversation.id, ...link, senderUid: uid, senderRole: "client", body: "Synthetic intake received", createdAt: serverTimestamp() });
  return { submission, record, conversation };
}
for (const kind of ["consult", "membership"]) test(`${kind} commits atomically and concurrent/uncertain retries create one intake`, async () => {
  const { submission, record } = await intake(kind);
  await Promise.all([submission.commit(), submission.commit()]); await submission.commit();
  const root = kind === "consult" ? "consultRequests" : "membershipApplications";
  assert.equal((await db.collection(root).get()).size, 1);
  assert.equal((await db.collection("conversations").get()).size, 1); assert.equal((await db.collection("messages").get()).size, 1);
  assert.equal((await db.collection(`portalSubmissions/${uid}/requests`).get()).size, 1);
  assert.equal((await getDocFromServer(record)).data().readiness, undefined);
});
test("closing between preparation and commit leaves no partial intake; reopening retries the same IDs", async () => {
  const { submission, record } = await intake(); await close();
  await assert.rejects(submission.commit(), { code: "maintenance" });
  assert.equal((await db.collection("consultRequests").get()).size, 0); assert.equal((await db.collection("conversations").get()).size, 0);
  await open(); await submission.commit(); assert.equal((await getDocFromServer(record)).exists(), true);
});
test("invalid final message rolls back every staged intake record", async () => {
  const { submission } = await intake();
  // Injecting a corrupt source via direct SDK is rejected atomically by rules.
  const batch = writeBatch(bd); batch.set(doc(bd, "consultRequests", "partial"), consult()); batch.set(doc(bd, "messages", "corrupt"), { clientUid: "safety-bob" });
  await assert.rejects(batch.commit(), { code: "permission-denied" });
  assert.equal((await db.collection("consultRequests").get()).size, 0);
  await submission.commit();
});
test("a transaction paused before fence activation retries or aborts without committing business data", async () => {
  let release, started; const gate = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { started = resolve; });
  const writing = guarded.runTransaction(async tx => { started(); await gate; tx.set(db.doc("projects/racing"), identity); }, { maxAttempts: 2 });
  await entered; const closing = close(); release(); await closing;
  // Firestore may serialize an already-running transaction before closure. Once
  // closure returns no transaction which observes the closed control may commit.
  await writing.catch(error => assert.equal(error.code, "maintenance"));
  await assert.rejects(guarded.doc("projects/late").set(identity), { code: "maintenance" });
  assert.equal((await db.doc("projects/late").get()).exists, false);
});
test("guard covers direct refs, nested refs, batch, payment writes and read-only transactions", async () => {
  await close();
  for (const write of [() => guarded.collection("paymentOrders").doc("order").create(identity), () => guarded.doc("studioClients/id").collection("audit").doc("change").set({ action: "test" }), () => guarded.batch().set(db.doc("payments/payment"), { amountCents: 1000 }).commit(), () => guarded.runTransaction(tx => tx.set(db.doc("projects/test"), identity))]) await assert.rejects(write(), { code: "maintenance" });
  assert.equal((await guarded.runTransaction(tx => tx.get(db.doc(`adminUsers/${staff}`)))).data().active, true);
  assert.throws(() => guarded.bulkWriter(), /unsupported_privileged_writer/);
});
test("manual CRM writes and admin replies stop during maintenance and do not create Auth accounts", async () => {
  await seedConversation(); const before = (await auth.listUsers()).users.length; await close();
  await assert.rejects(saveStudioClient(db, staff, { client: studio }), { code: "maintenance" });
  await assert.rejects(sendAdminMessage(db, staff, { id: "blocked", conversationId: "thread", body: "Synthetic reply" }), { code: "maintenance" });
  await open(); const result = await saveStudioClient(db, staff, { client: studio }); assert.ok(result.id);
  assert.equal((await auth.listUsers()).users.length, before);
  assert.equal((await db.doc(`portalRecords/clients/records/${result.id}`).get()).exists, false);
});
test("verification delivery and notification transport never run behind the fence", async () => {
  await close(); let calls = 0;
  const response = await handleVerification(new Request("http://localhost/api/auth/verification", { method: "POST", headers: { Authorization: `Bearer ${token}` } }), { firestore: db, auth, authenticate: async () => uid, env: {}, fetcher: async () => { calls++; return { ok: true }; } });
  assert.equal(response.status, 503); assert.equal(calls, 0);
  const config = notificationConfig({ NOTIFICATIONS_MODE: "test", NOTIFICATION_ACTIVATED_AT: new Date(0).toISOString() });
  await db.doc("consultRequests/received").set(identity);
  await assert.rejects(discoverNotifications(db, config), { code: "maintenance" });
  assert.deepEqual(await processNotifications(db, auth, notificationConfig({}), () => { calls++; }), { attempted: 0 }); assert.equal(calls, 0);
});
test("signup preflight is closed; a raced direct Auth signup retains its UID and can safely finish after reopening", async () => {
  await close(); await assert.rejects(assertBrowserWritesOpen(bd), { code: "maintenance" });
  // Firestore rules cannot disable Firebase Authentication registration itself.
  const account = await createUserWithEmailAndPassword(ba, "safety-raced@example.test", password);
  const newUid = account.user.uid;
  await assert.rejects(portal.setDoc(portal.doc(bd, "clients", newUid), { clientUid: newUid, ...dates() }), { code: "maintenance" });
  await open(); await portal.setDoc(portal.doc(bd, "clients", newUid), { clientUid: newUid, ...dates() });
  assert.equal(ba.currentUser.uid, newUid); assert.equal((await auth.getUser(newUid)).disabled, false);
});
test("new admin records default withheld, and ordinary legacy edits cannot publish any view", async () => {
  await signInWithEmailAndPassword(ba, `${staff}@example.test`, password);
  const ref = await admin.addDoc(collection(bd, "projects"), { ...identity, projectName: "Synthetic design", adminReview: { clientProjectSummary: "Synthetic sensitive review" } });
  assert.equal((await db.doc(`portalRecords/projects/records/${ref.id}`).get()).exists, false);
  assert.equal((await db.doc(`publicationRecords/projects/records/${ref.id}`).get()).data().state, "withheld");
  await admin.updateDoc(ref, { "adminReview.clientProjectSummary": "Changed health summary" });
  assert.equal((await db.doc(`portalRecords/projects/records/${ref.id}`).get()).exists, false);
  await assert.rejects(setDoc(portal.doc(bd, "projects", ref.id), identity), { code: "permission-denied" });
});
test("approved views survive private/admin edits without republishing changed text and need fresh source-bound approval", async () => {
  await db.doc("projects/project").set({ ...identity, projectName: "Approved design", clientProjectSummary: "Approved description", adminReview: { clientProjectSummary: "Do not copy this private review" } }); await publish("projects/project");
  const review = await reviewPublication(db, auth, staff, { path: "projects/project" });
  await signInWithEmailAndPassword(ba, `${staff}@example.test`, password);
  await admin.updateDoc(doc(bd, "projects", "project"), { projectName: "Changed design", "adminReview.clientProjectSummary": "Private health information" });
  const view = (await db.doc("portalRecords/projects/records/project").get()).data(); assert.equal(view.projectName, "Approved design"); assert.equal(view.clientProjectSummary, "Approved description");
  assert.equal((await db.doc("publicationRecords/projects/records/project").get()).data().state, "review_required");
  await assert.rejects(reviewPublication(db, auth, staff, { path: "projects/project", sourceHash: review.sourceHash, fields: Object.keys(review.candidate), reviewed: true }, true), /source_changed_review_again/);
  await publish("projects/project"); assert.equal((await db.doc("portalRecords/projects/records/project").get()).data().projectName, "Changed design");
  assert.equal((await db.collection("publicationRecords/projects/records/project/history").get()).size, 2);
});
test("health text, private summaries, previews and nested values require withholding or explicit redaction", async () => {
  await db.doc("projects/unsafe").set({ ...identity, projectName: "Synthetic design", project: { tattooIdea: "Synthetic medical information" }, adminReview: { clientProjectSummary: "Secret review" } });
  await assert.rejects(publish("projects/unsafe"), /sensitive_projected_content/);
  await publish("projects/unsafe", ["clientUid", "projectName"]);
  assert.deepEqual((await db.doc("portalRecords/projects/records/unsafe").get()).data(), { clientUid: uid, projectName: "Synthetic design" });
  await db.doc("conversations/unsafe").set({ ...identity, lastMessagePreview: "Synthetic health details" }); await assert.rejects(publish("conversations/unsafe"), /sensitive_projected_content/);
  await db.doc("projects/nested").set({ ...identity, projectName: { private: "Synthetic secret" } }); await assert.rejects(publish("projects/nested"), /record_is_private_or_requires_curation/);
});
test("publication requires an active admin, explicit review, valid account and same-owner relationships", async () => {
  await db.doc("projects/p").set({ ...identity, projectName: "Synthetic" });
  await assert.rejects(reviewPublication(db, auth, uid, { path: "projects/p" }), /access_denied/);
  const review = await reviewPublication(db, auth, staff, { path: "projects/p" });
  await assert.rejects(reviewPublication(db, auth, staff, { path: "projects/p", sourceHash: review.sourceHash, fields: ["clientUid"] }, true), /explicit_review_required/);
  await db.doc("projects/p").update({ consultRequestId: "other" }); await db.doc("consultRequests/other").set({ clientUid: "safety-bob" });
  await assert.rejects(publish("projects/p"), /relationship_owner_mismatch/);
  await assert.rejects(reviewPublication(db, auth, staff, { path: "studioClients/id" }), /unsupported_source_path/);
});
test("private source edits cannot alter approved conversation previews; authorized admin replies retain the reviewed subject", async () => {
  await seedConversation(); await signInWithEmailAndPassword(ba, `${staff}@example.test`, password);
  await admin.updateDoc(doc(bd, "conversations", "thread"), { subject: "Private review draft", lastMessagePreview: "Synthetic health details" });
  assert.equal((await db.doc("portalRecords/conversations/records/thread").get()).data().lastMessagePreview, "Approved preview");
  await sendAdminMessage(db, staff, { id: "reviewed-reply", conversationId: "thread", body: "Synthetic approved reply" });
  const view = (await db.doc("portalRecords/conversations/records/thread").get()).data(); assert.equal(view.subject, "Synthetic conversation"); assert.equal(view.lastMessagePreview, "Synthetic approved reply");
  await signInWithEmailAndPassword(ba, `${uid}@example.test`, password);
  await portal.updateDoc(portal.doc(bd, "conversations", "thread"), { unreadForClient: false, updatedAt: serverTimestamp() });
  assert.equal((await getDocFromServer(portal.doc(bd, "conversations", "thread"))).data().subject, "Synthetic conversation");
});
test("approved owner-scoped lists remain readable beyond the per-query access-call budget", async () => {
  const batch = db.batch();
  for (let i = 0; i < 20; i++) batch.set(db.doc(`portalRecords/projects/records/p${i}`), { ...identity, projectName: "Synthetic approved" });
  await batch.commit(); await close();
  assert.equal((await getDocsFromServer(query(portal.collection(bd, "projects"), where("clientUid", "==", uid)))).size, 20);
});
test("all HTTP mutation integrations use the guarded SDK and explicit preflight; activation remains off", async () => {
  const factory = fs.readFileSync("lib/server/firebaseAdmin.js", "utf8"); assert.match(factory, /firestore: fencedFirestore\(getFirestore\(app\)\)/);
  for (const route of ["admin/clients", "admin/messages", "admin/conversations", "admin/publication", "auth/verification", "founder/profile", "internal/notifications", "payments/checkout/founder", "payments/webhooks/square", "webhooks/resend"]) assert.match(fs.readFileSync(`app/api/${route}/route.js`, "utf8"), /assertServerWritesOpen/);
  for (const component of ["TattooPortalLogin", "ConsultRequestForm", "MembershipApplicationForm", "ClientMessages"]) assert.match(fs.readFileSync(`components/${component}.js`, "utf8"), /await assertBrowserWritesOpen\(db\);\s+const credential = await createUserWithEmailAndPassword/);
  assert.equal(notificationConfig({}).mode, "off"); assert.equal(writesOpen({ state: "open" }), false); await assertServerWritesOpen(db);
});

test("a queued batch from a previous open epoch is rejected after reopening", async () => {
  const approved = { ...identity, ...dates() }, batch = writeBatch(bd);
  batch.set(doc(bd, "clients", uid), approved); batch.set(portal.doc(bd, "clients", uid), approved);
  batch.set(doc(bd, "publicationRecords/clients/records", uid), { schemaVersion: 1, state: "approved", mode: "client_origin", actorUid: uid, reviewedAt: serverTimestamp(), fenceEpoch: OPEN_EMULATOR_FENCE.epoch, approved });
  await close(); await db.doc(WRITE_FENCE_PATH).set({ ...OPEN_EMULATOR_FENCE, epoch: "reopened-3" });
  await assert.rejects(batch.commit(), { code: "permission-denied" });
  assert.equal((await db.doc(`clients/${uid}`).get()).exists, false);
  await portal.setDoc(portal.doc(bd, "clients", uid), { ...identity, ...dates() });
  assert.equal((await db.doc(`publicationRecords/clients/records/${uid}`).get()).data().fenceEpoch, "reopened-3");
});
test("client read-state updates retain pending private review and the original approval revision", async () => {
  await seedConversation(); await signInWithEmailAndPassword(ba, `${staff}@example.test`, password);
  await admin.updateDoc(doc(bd, "conversations/thread"), { subject: "Unpublished studio draft" });
  await signInWithEmailAndPassword(ba, `${uid}@example.test`, password);
  await portal.updateDoc(portal.doc(bd, "conversations/thread"), { unreadForClient: false, updatedAt: serverTimestamp() });
  const policy = (await db.doc("publicationRecords/conversations/records/thread").get()).data();
  assert.equal(policy.state, "review_required"); assert.equal(policy.revision, 1);
  assert.equal(policy.approved.subject, "Synthetic conversation");
  await assert.rejects(updateDoc(doc(bd, "conversations/thread"), { lastMessagePreview: "Cached direct preview" }), { code: "permission-denied" });
});
test("read-only reconciliation inventories late/private/unreviewed/conflicting records without copying source text", async () => {
  const { createRehearsalRuntime } = await import("../../lib/migration/runtime.mjs");
  const { reconcilePublication } = await import("../../lib/safety/reconciliation.mjs");
  const { fingerprint } = await import("../../lib/migration/model.mjs");
  const runtime = createRehearsalRuntime();
  try {
    await db.doc("projects/approved").set({ ...identity, projectName: "Synthetic approved" }); await publish("projects/approved");
    await db.doc("projects/held").set({ ...identity, projectName: "Synthetic private health detail" });
    await db.doc("projects/unreviewed").set(identity); await db.doc("portalRecords/projects/records/unreviewed").set(identity);
    await db.doc("projects/conflict").set(identity); await db.doc("portalRecords/projects/records/conflict").set(identity); await db.doc("publicationRecords/projects/records/conflict").set({ schemaVersion: 1, state: "withheld" });
    const before = fingerprint((await db.doc("projects/held").get()).data());
    await close(); const report = await reconcilePublication(runtime, { frozenAt: new Date(0).toISOString() });
    assert.equal(report.counts.approved, 1); assert.equal(report.counts.withheld_no_view, 1); assert.equal(report.counts.unreviewed_view, 1); assert.equal(report.counts.view_policy_conflict, 1); assert.equal(report.lateWrites, 4);
    assert.doesNotMatch(JSON.stringify(report), /health|@|Synthetic/); assert.equal(fingerprint((await db.doc("projects/held").get()).data()), before);
    await assert.rejects(reconcilePublication({ firestore: db }, { frozenAt: new Date(0).toISOString() }), /untrusted_runtime/);
  } finally { await runtime.close(); }
});

test("withdrawal leaves a durable hold and original history; routine edits and notifications cannot republish it", async () => {
  await seedConversation();
  const review = await reviewPublication(db, auth, staff, { path: "conversations/thread" });
  await withdrawPublication(db, staff, { path: review.path, sourceHash: review.sourceHash, reviewed: true });
  assert.equal((await db.doc("publicationRecords/conversations/records/thread").get()).data().state, "withheld");
  assert.equal((await db.doc("portalRecords/conversations/records/thread").get()).exists, false);
  await assert.rejects(sendAdminMessage(db, staff, { id: "after-withdrawal", conversationId: "thread", body: "Synthetic reply" }), /message_not_authorized/);
  await signInWithEmailAndPassword(ba, `${staff}@example.test`, password);
  await admin.updateDoc(doc(bd, "conversations/thread"), { subject: "Later private edit" });
  assert.equal((await db.doc("portalRecords/conversations/records/thread").get()).exists, false);
  assert.equal((await db.doc("conversations/thread").get()).data().clientUid, uid);
});

test("signed Resend and Square callbacks return retryable failures during maintenance without changing history", async () => {
  const { createHmac } = await import("node:crypto");
  const { handleResendWebhook } = await import("../../lib/notifications/webhook.mjs");
  const { handleSquareWebhook } = await import("../../lib/payments/squareWebhookHandler.js");
  await db.doc("notificationQueue/accepted").set({ providerId: "synthetic-mail", status: "accepted" });
  await db.doc("payments/preserved").set({ amountCents: 12345, currency: "CAD", clientUid: uid });
  await close();
  const now = Date.now(), timestamp = String(Math.floor(now / 1000)), eventId = "synthetic-svix";
  const key = Buffer.alloc(32, 7), raw = JSON.stringify({ type: "email.delivered", data: { email_id: "synthetic-mail" } });
  const signature = createHmac("sha256", key).update(`${eventId}.${timestamp}.${raw}`).digest("base64");
  const email = await handleResendWebhook(new Request("http://localhost/api/webhooks/resend", { method: "POST", headers: { "svix-id": eventId, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }, body: raw }), db, { secret: `whsec_${key.toString("base64")}`, now });
  assert.equal(email.status, 503); assert.equal((await db.doc("notificationQueue/accepted").get()).data().status, "accepted");
  const paymentBody = JSON.stringify({ event_id: "synthetic-square", type: "synthetic.ignored" }), url = "https://studio.example.test/api/payments/webhooks/square", signatureKey = "synthetic-only-signature-key";
  const squareSignature = createHmac("sha256", signatureKey).update(url + paymentBody).digest("base64");
  const square = await handleSquareWebhook({ request: new Request(url, { method: "POST", headers: { "x-square-hmacsha256-signature": squareSignature }, body: paymentBody }), config: { environment: "sandbox", locationId: "synthetic-location", webhookSignatureKey: signatureKey, notificationUrl: url }, firestore: guarded, now: () => Timestamp.now() });
  assert.equal(square.status, 503); assert.equal((await db.doc("payments/preserved").get()).data().amountCents, 12345);
  assert.equal((await db.collection("paymentWebhookEvents").get()).size, 0);
});

test("new-conversation reply workflows use safe envelopes and cannot auto-publish legacy or cross-owner content", async () => {
  const { createAdminConversation } = await import("../../lib/notifications/adminConversations.mjs");
  const cases = [["consultRequestId", "consultRequests", "consult"], ["applicationId", "membershipApplications", "membershipApplication"], ["membershipChangeRequestId", "membershipChangeRequests", "membershipChangeRequest"], ["membershipOfferResponseId", "membershipOfferResponses", "membershipOfferResponse"]];
  for (const [index, [field, root, type]] of cases.entries()) {
    await db.doc(`${root}/source${index}`).set({ ...identity, adminReview: { internalNotes: "Synthetic private health detail" } });
    const input = { id: `new-thread-${index}`, data: { clientUid: uid, [field]: `source${index}`, sourceType: type, sourceId: `source${index}`, subject: "Synthetic private review summary" } };
    await Promise.all([createAdminConversation(db, auth, staff, input), createAdminConversation(db, auth, staff, input)]);
    const envelope = (await db.doc(`portalRecords/conversations/records/${input.id}`).get()).data();
    assert.equal(envelope.subject, "Tattoo Portal conversation"); assert.equal(envelope.lastMessagePreview, "");
    await sendAdminMessage(db, staff, { id: `new-reply-${index}`, conversationId: input.id, body: "Synthetic approved reply", relationships: { [field]: `source${index}` }, sourceType: type, sourceId: `source${index}` });
    assert.equal((await db.doc(`portalRecords/messages/records/new-reply-${index}`).get()).data()[field], `source${index}`);
  }
  await db.doc("conversations/legacy").set({ ...identity, lastMessagePreview: "Synthetic private health detail" });
  await assert.rejects(createAdminConversation(db, auth, staff, { id: "legacy", data: { clientUid: uid } }), /conversation_not_authorized/);
  await db.doc("consultRequests/other").set({ clientUid: "safety-bob" });
  await assert.rejects(createAdminConversation(db, auth, staff, { id: "forged", data: { clientUid: uid, consultRequestId: "other" } }), /conversation_not_authorized/);
  await close(); await assert.rejects(createAdminConversation(db, auth, staff, { id: "closed-new", data: { clientUid: uid } }), { code: "maintenance" });
});

test("browser admin conversation/message helpers preserve all five reply workflows through authenticated server delivery", async () => {
  const { createAdminConversation } = await import("../../lib/notifications/adminConversations.mjs");
  await signInWithEmailAndPassword(ba, `${staff}@example.test`, password);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (!["/api/admin/conversations", "/api/admin/messages"].includes(url)) return originalFetch(url, options);
    const claims = await auth.verifyIdToken(options.headers.Authorization.slice(7), true), input = JSON.parse(options.body);
    const result = url === "/api/admin/conversations" ? await createAdminConversation(db, auth, claims.uid, input) : await sendAdminMessage(db, claims.uid, input);
    return Response.json(result);
  };
  try {
    await seedConversation();
    const cases = [["AdminInbox", null, null, "thread"], ["AdminIntakeDashboard", "consultRequestId", "consultRequests"], ["AdminMembershipOffers", "applicationId", "membershipApplications"], ["AdminMembershipRequests", "membershipChangeRequestId", "membershipChangeRequests"], ["AdminMembershipOfferResponses", "membershipOfferResponseId", "membershipOfferResponses"]];
    for (const [workflow, field, root, existing] of cases) {
      if (root) await db.doc(`${root}/${workflow}`).set(identity);
      const relationships = field ? { [field]: workflow } : {};
      const conversation = existing ? { id: existing } : await admin.addDoc(collection(bd, "conversations"), { ...identity, ...relationships, subject: "Synthetic private health draft", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      const message = await admin.addDoc(collection(bd, "messages"), { ...identity, ...relationships, conversationId: conversation.id, body: `Synthetic ${workflow} reply` });
      const view = (await db.doc(`portalRecords/messages/records/${message.id}`).get()).data(); assert.equal(view.conversationId, conversation.id); assert.equal(view.body, `Synthetic ${workflow} reply`);
      if (field) assert.equal(view[field], workflow);
      assert.doesNotMatch((await db.doc(`portalRecords/conversations/records/${conversation.id}`).get()).data().subject, /health/);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("unsupported legacy SDK values are withheld rather than serialized into a review response", async () => {
  const { approvedSnapshot } = await import("../../lib/safety/publicationState.mjs");
  const unsafe = { ...identity, projectName: db.doc("clients/private-synthetic-reference") };
  await db.doc("projects/reference-value").set(unsafe);
  await assert.rejects(reviewPublication(db, auth, staff, { path: "projects/reference-value" }), /unsupported_source_type/);
  assert.equal(approvedSnapshot({ schemaVersion: 1, state: "approved", approved: unsafe }, unsafe, uid), false);
  await assert.rejects(publish("projects/reference-value"), /unsupported_source_type/);
});
