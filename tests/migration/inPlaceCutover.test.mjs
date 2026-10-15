import fs from "node:fs";
import { before, beforeEach, afterEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, getDocFromServer, getDocsFromServer, doc, collection, query, where, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseEnvironment, DEMO_PROJECT_ID } from "../../lib/firebaseEnvironment.mjs";
import { createRehearsalRuntime } from "../../lib/migration/runtime.mjs";
import { planMigration, applyMigration, rollbackMigration } from "../../lib/migration/engine.mjs";
import { seedSyntheticRehearsal, syntheticManifest, syntheticSources, OWNER, REVIEWER } from "../../lib/migration/fixtures.mjs";
import { fingerprint } from "../../lib/migration/model.mjs";
import { verifyFirebaseBearerToken } from "../../lib/payments/firebaseBearerAuth.js";
const CURRENT_RULES = fs.readFileSync("firestore.rules", "utf8");
// Representative old reader boundary, not a claim about deployed live rules.
// Loaded into the fixed local emulator only; never written to a deployable file.
const LEGACY_READ_RULES = `rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{name}/{id} { allow read: if request.auth != null && resource.data.clientUid == request.auth.uid; allow write: if false; } } }`;
let runtime, app, auth, db, portal, envs;
async function loadRules(rules) {
  const env = await initializeTestEnvironment({ projectId: DEMO_PROJECT_ID, firestore: { rules } });
  envs.push(env); return env;
}
const read = ref => getDocFromServer(ref);
async function login(uid = OWNER) { return signInWithEmailAndPassword(auth, `${uid}@example.test`, "Synthetic-only-123!"); }
async function manifest() { return syntheticManifest(runtime, "in-place-session-review", "SYNTHETIC_ONLY"); }
const apply = value => applyMigration(runtime, value, "APPLY_APPROVED_SYNTHETIC_PROJECTIONS");
async function hashes() {
  return Object.fromEntries(await Promise.all(Object.keys(syntheticSources()).map(async path => {
    const snapshot = await runtime.firestore.doc(path).get();
    return [path, { data: fingerprint(snapshot.data()), createTime: fingerprint(snapshot.createTime), updateTime: fingerprint(snapshot.updateTime) }];
  })));
}
before(async () => {
  runtime = createRehearsalRuntime();
  app = initializeApp(firebaseEnvironment().config, "in-place-cutover-client"); auth = getAuth(app); db = getFirestore(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(db, "127.0.0.1", 8080);
  portal = await import("../../lib/portalFirestore.js");
});
beforeEach(async () => {
  envs = []; await signOut(auth);
  const env = await loadRules(CURRENT_RULES); await env.clearFirestore();
  await seedSyntheticRehearsal(runtime, "SYNTHETIC_ONLY");
});
afterEach(async () => { await Promise.all(envs.map(env => env.cleanup())); });
after(async () => { await signOut(auth); await deleteApp(app); await runtime.close(); });

test("same-project session remains valid through an old-reader to private-projection rule cutover", async () => {
  await login(); const token = await auth.currentUser.getIdToken();
  const before = await hashes();
  const account = await runtime.auth.getUser(OWNER);
  await loadRules(LEGACY_READ_RULES);
  assert.equal((await read(doc(db, "clients", OWNER))).exists(), true);
  await assert.rejects(read(portal.doc(db, "clients", OWNER)), { code: "permission-denied" });
  await apply(await manifest());
  // Preparing views alone must not make the old rule/frontend combination viable.
  await assert.rejects(read(portal.doc(db, "clients", OWNER)), { code: "permission-denied" });
  await loadRules(CURRENT_RULES);
  await assert.rejects(read(doc(db, "clients", OWNER)), { code: "permission-denied" });
  const profile = await read(portal.doc(db, "clients", OWNER));
  assert.equal(profile.data().clientUid, OWNER); assert.equal(profile.data().adminReview, undefined);
  assert.equal(await auth.currentUser.getIdToken(), token);
  const uid = await verifyFirebaseBearerToken(new Request("http://localhost/api/synthetic", { headers: { Authorization: `Bearer ${token}` } }), runtime.auth.verifyIdToken.bind(runtime.auth));
  assert.equal(uid, OWNER);
  const after = await runtime.auth.getUser(OWNER);
  assert.equal(after.uid, account.uid); assert.equal(after.metadata.creationTime, account.metadata.creationTime);
  assert.deepEqual(await hashes(), before);
});

test("new privacy rules safely return an absent own profile until review without legacy fallback or overwrite", async () => {
  await login(); const token = await auth.currentUser.getIdToken();
  assert.equal((await read(portal.doc(db, "clients", OWNER))).exists(), false);
  await assert.rejects(read(doc(db, "clients", OWNER)), { code: "permission-denied" });
  const before = fingerprint((await runtime.firestore.doc(`clients/${OWNER}`).get()).data());
  await assert.rejects(portal.setDoc(portal.doc(db, "clients", OWNER), { clientUid: OWNER, clientName: "Forged replacement", createdAt: serverTimestamp(), updatedAt: serverTimestamp() }), { code: "permission-denied" });
  assert.equal(fingerprint((await runtime.firestore.doc(`clients/${OWNER}`).get()).data()), before);
  await apply(await manifest());
  assert.equal((await read(portal.doc(db, "clients", OWNER))).exists(), true);
  assert.equal(await auth.currentUser.getIdToken(), token);
});

test("existing conversation selection, messages and reply/read-state writes work with the unchanged login", async () => {
  await login(); const token = await auth.currentUser.getIdToken(); await apply(await manifest());
  const messages = await getDocsFromServer(query(portal.collection(db, "messages"), where("clientUid", "==", OWNER), where("conversationId", "==", "rehearsal-conversation")));
  assert.deepEqual(messages.docs.map(item => item.id), ["rehearsal-message"]);
  const conversation = portal.doc(portal.collection(db, "conversations"), "rehearsal-conversation");
  const reply = await portal.addDoc(portal.collection(db, "messages"), { clientUid: OWNER, conversationId: conversation.id, consultRequestId: "rehearsal-consult", applicationId: null, senderUid: OWNER, senderRole: "client", senderName: "Synthetic Alice", body: "Synthetic follow-up after cutover", createdAt: serverTimestamp() });
  assert.equal((await read(reply)).data().conversationId, conversation.id);
  await portal.updateDoc(conversation, { lastMessagePreview: "Synthetic follow-up after cutover", unreadForAdmin: true, unreadForClient: false, updatedAt: serverTimestamp() });
  assert.equal((await read(conversation)).data().unreadForClient, false);
  assert.equal(await auth.currentUser.getIdToken(), token);
  await assert.rejects(read(doc(db, "messages", "rehearsal-sensitive-message")), { code: "permission-denied" });
});

test("source-only legacy intake stays private and requires explicit reconciliation rather than silent backfill", async () => {
  await login();
  // Existing proposed rules permit a valid private source-only create. This is
  // an availability/reconciliation requirement, not a legacy-read exception.
  const original = doc(db, "consultRequests", "in-place-legacy-intake");
  await setDoc(original, { clientUid: OWNER, clientName: "Synthetic Alice", clientEmail: `${OWNER}@example.test`, status: "new", request: { tattooIdea: "Synthetic old-form request" }, readiness: { healthNotes: "Synthetic medical detail stays private" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await assert.rejects(read(original), { code: "permission-denied" });
  assert.equal((await runtime.firestore.doc(original.path).get()).data().readiness.healthNotes, "Synthetic medical detail stays private");
  assert.equal((await runtime.firestore.doc("portalRecords/consultRequests/records/in-place-legacy-intake").get()).exists, false);
  const report = await planMigration(runtime, await manifest());
  assert.equal(report.records.find(item => item.path === original.path).state, "withheld");
});

test("new signup and paired consult submission work under the same project without taking over prior history", async () => {
  const created = await createUserWithEmailAndPassword(auth, `in-place-${crypto.randomUUID()}@example.test`, "Synthetic-only-123!");
  const uid = created.user.uid;
  await portal.setDoc(portal.doc(db, "clients", uid), { clientUid: uid, clientName: "New synthetic client", clientEmail: created.user.email, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const consult = await portal.addDoc(portal.collection(db, "consultRequests"), { clientUid: uid, clientName: "New synthetic client", clientEmail: created.user.email, status: "new", request: { tattooIdea: "Synthetic new request" }, readiness: { healthNotes: "Synthetic medical detail" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  assert.equal((await read(consult)).data().readiness, undefined);
  assert.equal((await runtime.firestore.doc(`consultRequests/${consult.id}`).get()).data().clientUid, uid);
  await assert.rejects(read(doc(db, "clients", OWNER)), { code: "permission-denied" });
  await assert.rejects(read(portal.doc(db, "clients", OWNER)), { code: "permission-denied" });
});

test("privacy-preserving withdrawal leaves the existing account, originals and session intact", async () => {
  await login(); const token = await auth.currentUser.getIdToken(), before = await hashes();
  const approved = await manifest(); await apply(approved);
  const result = await rollbackMigration(runtime, approved, "WITHDRAW_REHEARSAL_PROJECTIONS");
  assert.equal(result.counts.rolled_back, 13);
  assert.equal((await read(portal.doc(db, "clients", OWNER))).exists(), false);
  await assert.rejects(read(doc(db, "clients", OWNER)), { code: "permission-denied" });
  assert.equal((await runtime.auth.verifyIdToken(token, true)).uid, OWNER);
  assert.deepEqual(await hashes(), before);
});

test("admin/non-admin, anonymous and unrelated sessions retain the private read boundary", async () => {
  await apply(await manifest());
  await login("rehearsal-bob");
  await assert.rejects(read(portal.doc(db, "clients", OWNER)), { code: "permission-denied" });
  await assert.rejects(read(doc(db, "clients", OWNER)), { code: "permission-denied" });
  await signOut(auth);
  await assert.rejects(read(portal.doc(db, "clients", OWNER)), { code: "permission-denied" });
  await login(REVIEWER);
  assert.equal((await read(doc(db, "clients", OWNER))).data().clientUid, OWNER);
  await assert.rejects(read(doc(db, "studioClients", "rehearsal-studio")), { code: "permission-denied" });
});
