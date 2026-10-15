import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeApp as clientApp, deleteApp as deleteClientApp } from "firebase/app";
import { getAuth as clientAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore as clientDb, connectFirestoreEmulator, doc, getDoc, setDoc, getDocs, collection, updateDoc, deleteDoc } from "firebase/firestore";
import { firebaseEnvironment, DEMO_PROJECT_ID } from "../../lib/firebaseEnvironment.mjs";
import { verifyFirebaseBearerToken } from "../../lib/payments/firebaseBearerAuth.js";
import { handleClientRequest } from "../../lib/clients/clientHandler.mjs";
import { associateConsult, saveStudioClient } from "../../lib/clients/clientService.mjs";

let app, firestore, auth, browser, browserAuth, browserDb, tokens;
const adminUid = "phase2-admin";
const sample = patch => ({ name: "Synthetic Studio Client", email: "studio@example.test", phone: "5551234567", instagram: "@synthetic", preferredArtist: "ben", status: "lead", studioNotes: "Private synthetic studio note", ...patch });
const request = (uid = adminUid, input, params = "") => handleClientRequest(new Request(`http://localhost/api/admin/clients${params}`, { method: input ? "POST" : "GET", headers: { ...(uid ? { Authorization: `Bearer ${tokens[uid] || "invalid"}` } : {}), "Content-Type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}) }), { firestore, authenticate: req => verifyFirebaseBearerToken(req, auth.verifyIdToken.bind(auth)) });
async function save(client = sample(), rest = {}) {
  const response = await request(adminUid, { action: "save", client, ...rest });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  return response.json();
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  app = initializeApp({ projectId: DEMO_PROJECT_ID }, "phase2-tests");
  firestore = getFirestore(app); auth = getAuth(app);
  browser = clientApp(firebaseEnvironment().config, "phase2-browser");
  browserAuth = clientAuth(browser); connectAuthEmulator(browserAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  browserDb = clientDb(browser); connectFirestoreEmulator(browserDb, "127.0.0.1", 8080);
  tokens = {};
  for (const [uid, active] of [[adminUid, true], ["phase2-inactive", false], ["phase2-client", null]]) {
    try { await auth.createUser({ uid, email: `${uid}@example.test`, password: "Synthetic-only-123!" }); } catch (e) { if (e.code !== "auth/uid-already-exists" && e.code !== "auth/email-already-exists") throw e; }
    if (active !== null) await firestore.doc(`adminUsers/${uid}`).set({ active });
    await signInWithEmailAndPassword(browserAuth, `${uid}@example.test`, "Synthetic-only-123!");
    tokens[uid] = await browserAuth.currentUser.getIdToken();
  }
});
after(async () => { await deleteClientApp(browser); await deleteApp(app); });

test("admin API rejects missing/invalid tokens, clients and inactive admins on reads and writes", async () => {
  for (const uid of [null, "invalid", "phase2-client", "phase2-inactive"]) {
    for (const body of [undefined, { action: "save", client: sample() }]) {
      const result = await request(uid, body);
      assert.equal(result.status, 403);
      assert.deepEqual(await result.json(), { error: "access_denied" });
      assert.match(result.headers.get("cache-control"), /no-store/);
    }
  }
});

test("manual creation and revision-checked edits preserve stable studio IDs without creating Auth accounts", async () => {
  const beforeUsers = (await auth.listUsers()).users.map(u => u.uid).sort();
  const created = await save();
  assert.notEqual(created.id, adminUid);
  assert.notEqual(created.id, "phase2-client");
  const saved = await save(sample({ name: "Edited Synthetic", email: "edited@example.test", phone: "5559876543", instagram: "edited", preferredArtist: "autumn", status: "booked", studioNotes: "Changed private notes" }), { id: created.id, revision: created.revision });
  assert.equal(saved.id, created.id);
  assert.equal(saved.revision, 2);
  const detail = await (await request(adminUid, undefined, `?id=${created.id}`)).json();
  assert.equal(detail.client.studioNotes, "Changed private notes");
  assert.equal(detail.client.clientUid, undefined);
  assert.equal(detail.audit.length, 2);
  assert.equal(detail.audit[0].actorUid, adminUid);
  assert.ok(detail.audit[0].changedFields.includes("studioNotes"));
  assert.equal(JSON.stringify(detail.audit).includes("Changed private notes"), false);
  assert.deepEqual((await auth.listUsers()).users.map(u => u.uid).sort(), beforeUsers);
  assert.equal((await firestore.doc(`portalRecords/clients/records/${created.id}`).get()).exists, false);
  const stale = await request(adminUid, { action: "save", client: sample(), id: created.id, revision: 1 });
  assert.equal(stale.status, 409);
  assert.equal((await firestore.doc(`studioClients/${created.id}`).get()).data().revision, 2);
});

test("matching contact details require a reviewed duplicate decision and never merge files", async () => {
  const data = sample({ name: "Duplicate Test", email: "duplicate@example.test", phone: "5552223333", instagram: "duplicate" });
  const first = await save(data);
  const response = await request(adminUid, { action: "save", client: { ...data, email: "DUPLICATE@EXAMPLE.TEST", phone: "+1 (555) 222-3333" } });
  assert.equal(response.status, 409);
  const warning = await response.json();
  assert.ok(warning.candidates.some(c => c.id === first.id));
  const second = await save({ ...data, email: "DUPLICATE@EXAMPLE.TEST", phone: "+1 (555) 222-3333" }, { duplicateReview: { token: warning.duplicateToken, reason: "Reviewed two separate synthetic people" } });
  assert.notEqual(first.id, second.id);
  assert.equal((await firestore.doc(`studioClients/${first.id}`).get()).data().revision, 1);
  const detail = await (await request(adminUid, undefined, `?id=${second.id}`)).json();
  assert.deepEqual(detail.audit[0].duplicateReview.candidateIds, [first.id]);
  const replay = await request(adminUid, { action: "save", client: data, duplicateReview: { token: warning.duplicateToken, reason: "Stale duplicate review should be rejected" } });
  assert.equal(replay.status, 409);
});

test("concurrent duplicate creates serialize and only one unreviewed file commits", async () => {
  const client = sample({ name: "Concurrent Synthetic", email: "concurrent@example.test", phone: "5554446666", instagram: "concurrent" });
  const results = await Promise.all([request(adminUid, { action: "save", client }), request(adminUid, { action: "save", client })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test("reviewed consultation association preserves all source history, UIDs and portal records", async () => {
  const created = await save(sample({ name: "Association Synthetic", email: "association@example.test", phone: "5550001111", instagram: "association" }));
  const consultId = "phase2-consult";
  const paths = ["consultRequests/phase2-consult", "messages/phase2-message", "appointments/phase2-appointment", "projects/phase2-project", "payments/phase2-payment", "conversations/phase2-conversation", "membershipApplications/phase2-application", "portalRecords/consultRequests/records/phase2-consult"];
  const originals = {};
  for (const path of paths) {
    originals[path] = { clientUid: "phase2-client", consultRequestId: consultId, body: "Synthetic original preserved", adminReview: { internalNotes: "Synthetic private notes" } };
    await firestore.doc(path).set(originals[path]);
  }
  const review = await (await request(adminUid, undefined, `?consultId=${consultId}`)).json();
  assert.equal(review.consult.adminReview, undefined);
  const body = { action: "associate", id: created.id, revision: 1, consultId, reason: "Reviewed synthetic identity with the studio", reviewed: true, consultReviewToken: review.consultReviewToken };
  assert.equal((await request(adminUid, { ...body, reviewed: false })).status, 400);
  assert.equal((await request(adminUid, { ...body, consultReviewToken: "stale" })).status, 409);
  assert.equal((await request(adminUid, body)).status, 200);
  assert.equal((await request(adminUid, body)).status, 200);
  for (const path of paths) assert.deepEqual((await firestore.doc(path).get()).data(), originals[path]);
  const association = (await firestore.doc(`studioConsultAssociations/${consultId}`).get()).data();
  assert.equal(association.studioClientId, created.id);
  const detail = await (await request(adminUid, undefined, `?id=${created.id}`)).json();
  assert.equal(detail.associations.length, 1);
  assert.equal(detail.audit.filter(a => a.action === "consult_associated").length, 1);
  const other = await save(sample({ name: "Other Synthetic", email: "other@example.test", phone: "5557778888", instagram: "other" }));
  assert.equal((await request(adminUid, { ...body, id: other.id })).status, 409);
  assert.equal((await request(adminUid, { ...body, consultId: "missing" })).status, 404);
});

test("changed consultation, stale client, removed admin and unsupported linking prevent writes", async () => {
  const created = await save(sample({ name: "Guard Synthetic", email: "guard@example.test", phone: "5558889999", instagram: "guard" }));
  const consult = firestore.doc("consultRequests/phase2-changing-consult");
  await consult.set({ clientUid: "phase2-client", clientName: "Synthetic" });
  const review = await (await request(adminUid, undefined, "?consultId=phase2-changing-consult")).json();
  await consult.update({ clientName: "Changed synthetic" });
  await assert.rejects(associateConsult(firestore, adminUid, { id: created.id, revision: 1, consultId: consult.id, consultReviewToken: review.consultReviewToken, reviewed: true, reason: "Reviewed synthetic client" }), /record_changed_reload/);
  await firestore.doc(`adminUsers/${adminUid}`).update({ active: false });
  try { await assert.rejects(saveStudioClient(firestore, adminUid, { client: sample() }), /access_denied/); }
  finally { await firestore.doc(`adminUsers/${adminUid}`).update({ active: true }); }
  assert.equal((await request(adminUid, { action: "link", id: created.id, uid: "phase2-client" })).status, 400);
  assert.equal((await request(adminUid, { action: "save", client: { ...sample(), clientUid: "phase2-client" } })).status, 400);
});

test("private studio files, duplicate locks, associations and audit are denied to every browser role", async () => {
  const id = (await firestore.collection("studioClients").limit(1).get()).docs[0].id;
  const paths = [`studioClients/${id}`, `studioClients/${id}/audit/forged`, "studioConsultAssociations/phase2-consult", "studioClientDuplicateLocks/forged"];
  for (const uid of [null, "phase2-client", "phase2-inactive", adminUid]) {
    if (uid) await signInWithEmailAndPassword(browserAuth, `${uid}@example.test`, "Synthetic-only-123!");
    else await signOut(browserAuth);
    for (const path of paths) {
      const ref = doc(browserDb, path);
      for (const operation of [() => getDoc(ref), () => setDoc(ref, { studioNotes: "Forged" }), () => updateDoc(ref, { studioNotes: "Forged" }), () => deleteDoc(ref)]) await assert.rejects(operation(), { code: "permission-denied" });
    }
    await assert.rejects(getDocs(collection(browserDb, "studioClients")), { code: "permission-denied" });
  }
});

test("paginated listing is authorized and rejects malformed IDs without exposing errors", async () => {
  const result = await request();
  assert.equal(result.status, 200);
  const { clients } = await result.json();
  assert.ok(clients.length >= 5);
  assert.equal((await request(adminUid, undefined, "?id=..%2FadminUsers")).status, 400);
  assert.equal((await request(adminUid, undefined, "?id=missing")).status, 404);
});


test("pagination includes every studio file once across 100-record boundaries", async () => {
  const batch = firestore.batch();
  for (let index = 0; index < 105; index++) batch.set(firestore.doc(`studioClients/pagination-${String(index).padStart(3, "0")}`), { ...sample({ name: `Synthetic page ${index}` }), revision: 1 });
  await batch.commit();
  const first = await (await request()).json();
  assert.equal(first.clients.length, 100);
  assert.ok(first.nextCursor);
  const second = await (await request(adminUid, undefined, `?after=${first.nextCursor}`)).json();
  assert.equal(second.nextCursor, null);
  const ids = [...first.clients, ...second.clients].map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter(id => id.startsWith("pagination-")).length, 105);
});
