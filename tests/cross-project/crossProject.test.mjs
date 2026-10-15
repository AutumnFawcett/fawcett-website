import fs from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import { doc, getDoc, getDocs, collection, where, query } from "firebase/firestore";
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes, getMetadata } from "firebase/storage";
import { fingerprint, candidateProjection } from "../../lib/migration/model.mjs";
import { guard, createPair, seedSource, copyFixture, publishApprovedFixture, planCopy, logical, rebind, SOURCE, TARGET, OWNER, REVIEWER, SYNTHETIC_PASSWORD, APPROVED_PATHS } from "./syntheticHarness.mjs";
let pair, sourceEnv, targetEnv, sourceApp, targetApp, sourceStorage, targetStorage, targetDb, paths;
before(async () => {
  pair = createPair();
  const rules = fs.readFileSync("firestore.rules", "utf8");
  sourceEnv = await initializeTestEnvironment({ projectId: SOURCE, firestore: { rules } });
  targetEnv = await initializeTestEnvironment({ projectId: TARGET, firestore: { rules } });
  for (const [projectId, name] of [[SOURCE, "cross-source-browser"], [TARGET, "cross-target-browser"]]) {
    const app = initializeApp({ projectId, apiKey: `demo-${projectId}`, authDomain: "localhost", storageBucket: `${projectId}.appspot.com` }, name);
    const storage = getStorage(app); connectStorageEmulator(storage, "127.0.0.1", 9199, { mockUserToken: { sub: OWNER } });
    if (projectId === SOURCE) { sourceApp = app; sourceStorage = storage; }
    else { targetApp = app; targetStorage = storage; }
  }
});
beforeEach(async () => {
  await Promise.all([sourceEnv.clearFirestore(), targetEnv.clearFirestore()]);
  targetDb = targetEnv.authenticatedContext(OWNER).firestore();
  for (const auth of [pair.source.auth, pair.target.auth]) {
    const users = (await auth.listUsers()).users;
    if (users.length) await auth.deleteUsers(users.map(u => u.uid));
  }
  paths = await seedSource(pair);
});
after(async () => { await Promise.all([deleteApp(sourceApp), deleteApp(targetApp), sourceEnv.cleanup(), targetEnv.cleanup()]); await pair.close(); });
const copy = () => copyFixture(pair, paths, "COPY_SYNTHETIC_FIXTURE");
// The Auth Emulator ignores API-key project selection. Select its fixed logical
// namespace explicitly; this emulator-only field is NOT production client code.
async function authRequest(projectId, operation, body) {
  guard(); assert.ok([SOURCE, TARGET].includes(projectId));
  const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/${operation}?key=synthetic-only`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ ...body, targetProjectId: projectId }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "synthetic_auth_failed");
  return data;
}
const login = projectId => authRequest(projectId, "accounts:signInWithPassword", { email: `${OWNER}@example.test`, password: SYNTHETIC_PASSWORD, returnSecureToken: true });
async function freshTargetLogin() {
  // Explicit fixture provisioning, not a production password import claim.
  await pair.target.auth.updateUser(OWNER, { password: SYNTHETIC_PASSWORD });
  return login(TARGET);
}
async function originals(db) {
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, fingerprint(logical((await db.doc(path).get()).data()))])));
}

test("cross-project harness rejects nonlocal endpoints and credentials without weakening the Phase 3 guard", () => {
  assert.doesNotThrow(() => guard());
  assert.throws(() => rebind(pair.target.db.doc("projects/foreign"), pair.target.db), /foreign_reference/);
  for (const patch of [{ FIRESTORE_EMULATOR_HOST: "remote:443" }, { FIREBASE_STORAGE_EMULATOR_HOST: "remote:443" }, { STORAGE_EMULATOR_HOST: "https://storage.googleapis.com" }, { GOOGLE_APPLICATION_CREDENTIALS: "/never-read.json" }, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fawcett-website" }, { GCLOUD_PROJECT: "fawcett-website-sandbox" }]) assert.throws(() => guard({ ...process.env, ...patch }));
});

test("two isolated projects preserve exact logical originals, UIDs and metadata while withholding privileges", async () => {
  const before = await originals(pair.source.db);
  assert.equal((await planCopy(pair, paths)).collisions.length, 0);
  const result = await copy();
  assert.equal(result.copiedAuth, 5); assert.equal(result.copiedOriginals, 24); assert.equal(result.withheldAdminRoles, 1);
  for (const path of paths.filter(p => !p.startsWith("adminUsers/"))) assert.equal(fingerprint(logical((await pair.target.db.doc(path).get()).data())), before[path]);
  assert.deepEqual(await originals(pair.source.db), before);
  const source = await pair.source.auth.getUser(OWNER), target = await pair.target.auth.getUser(OWNER);
  assert.equal(target.uid, source.uid); assert.equal(target.email, source.email); assert.equal(target.emailVerified, source.emailVerified); assert.equal(target.metadata.creationTime, source.metadata.creationTime);
  assert.equal((await pair.target.auth.getUser("rehearsal-disabled")).disabled, true);
  const provider = await pair.target.auth.getUser("rehearsal-federated");
  assert.equal(provider.providerData[0].providerId, "google.com");
  assert.equal(provider.providerData[0].uid, "synthetic-google-subject");
  assert.equal(provider.phoneNumber, "+15555550199");
  assert.deepEqual(target.customClaims, { accountType: "synthetic-client" });
  assert.equal((await pair.target.db.doc(`adminUsers/${REVIEWER}`).get()).exists, false);
  const reference = (await pair.target.db.doc("projects/rehearsal-reference").get()).data().originalRef;
  assert.equal(reference.firestore.projectId, TARGET); assert.equal(reference.path, "consultRequests/rehearsal-consult");
  assert.equal((await pair.target.db.doc("payments/rehearsal-payment").get()).data().amountCents, 12345);
  assert.equal((await pair.target.db.doc("creditLedger/rehearsal-credit").get()).data().deltaCents, -2345);
});

test("destination UID, email and document collisions block copying without touching existing records", async () => {
  for (const conflict of [{ uid: OWNER, email: "different@example.test" }, { uid: "other-destination-uid", email: `${OWNER}@example.test` }]) {
    await pair.target.auth.createUser(conflict);
    await assert.rejects(copy(), /destination_collision/);
    assert.equal((await pair.target.auth.listUsers()).users.length, 1);
    assert.equal((await pair.target.db.doc(paths[0]).get()).exists, false);
    await pair.target.auth.deleteUser(conflict.uid);
  }
  const collision = await pair.target.auth.importUsers([{ uid: "different-provider-uid", phoneNumber: "+15555550199", providerData: [{ providerId: "google.com", uid: "synthetic-google-subject" }] }]);
  assert.equal(collision.failureCount, 0);
  await assert.rejects(copy(), /destination_collision/);
  await pair.target.auth.deleteUser("different-provider-uid");
  await pair.target.db.doc("payments/rehearsal-payment").create({ amountCents: 999, marker: "Destination-owned synthetic payment" });
  await assert.rejects(copy(), /destination_collision/);
  assert.equal((await pair.target.db.doc("payments/rehearsal-payment").get()).data().amountCents, 999);
  assert.equal((await pair.target.auth.listUsers()).users.length, 0);
});

test("source session cannot authenticate to target; identity-only import needs an explicit credential path", async () => {
  const oldToken = (await login(SOURCE)).idToken;
  await copy();
  await assert.rejects(pair.target.auth.verifyIdToken(oldToken), /audience|aud|issuer|project/i);
  await assert.rejects(login(TARGET));
  const newToken = (await freshTargetLogin()).idToken;
  assert.equal((await pair.target.auth.verifyIdToken(newToken)).uid, OWNER);
  await assert.rejects(pair.source.auth.verifyIdToken(newToken), /audience|aud|issuer|project/i);
});

test("reviewed destination views exclude clinical/private history and restrict clients to own records", async () => {
  await copy();
  const report = await publishApprovedFixture(pair, paths, "PUBLISH_REVIEWED_SYNTHETIC_VIEWS");
  assert.equal(report.published, 13); assert.equal(report.withheld, 12);
  await freshTargetLogin();
  const profile = await getDoc(doc(targetDb, `portalRecords/clients/records/${OWNER}`));
  assert.equal(profile.data().adminReview, undefined);
  await assert.rejects(getDoc(doc(targetDb, `clients/${OWNER}`)), { code: "permission-denied" });
  await assert.rejects(getDoc(doc(targetDb, "studioClients/rehearsal-studio")), { code: "permission-denied" });
  const messages = await getDocs(query(collection(targetDb, "portalRecords/messages/records"), where("clientUid", "==", OWNER)));
  assert.deepEqual(messages.docs.map(d => d.id), ["rehearsal-message"]);
  assert.equal(messages.docs[0].data().senderUid, undefined);
  assert.equal((await pair.target.db.doc("portalRecords/messages/records/rehearsal-sensitive-message").get()).exists, false);
  assert.equal((await pair.target.db.doc("portalRecords/conversations/records/rehearsal-sensitive-preview").get()).exists, false);
  const registered = await authRequest(TARGET, "accounts:signUp", { email: `new-${crypto.randomUUID()}@example.test`, password: SYNTHETIC_PASSWORD, returnSecureToken: true });
  assert.equal((await pair.target.auth.getUser(registered.localId)).uid, registered.localId);
  await assert.rejects(pair.source.auth.getUser(registered.localId), { code: "auth/user-not-found" });
  targetDb = targetEnv.authenticatedContext(registered.localId).firestore();
  await assert.rejects(getDoc(doc(targetDb, `portalRecords/clients/records/${OWNER}`)), { code: "permission-denied" });
});

test("Storage copy preserves fixture bytes, object key and reviewed metadata using separate buckets", async () => {
  await login(SOURCE); await copy(); await freshTargetLogin();
  const key = `synthetic/${crypto.randomUUID()}/reference.txt`, bytes = new TextEncoder().encode("Synthetic reference artwork only");
  const from = ref(sourceStorage, key), to = ref(targetStorage, key);
  await uploadBytes(from, bytes, { contentType: "text/plain", customMetadata: { ownerUid: OWNER, classification: "private-synthetic" } });
  const before = new Uint8Array(await getBytes(from));
  const metadata = await getMetadata(from);
  // Copy only reviewed custom metadata: never blindly clone bearer download tokens.
  const copied = { contentType: metadata.contentType, customMetadata: { ownerUid: metadata.customMetadata.ownerUid, classification: metadata.customMetadata.classification } };
  async function copyAbsent() {
    let exists = false;
    try { await getMetadata(to); exists = true; } catch (error) { if (error.code !== "storage/object-not-found") throw error; }
    assert.equal(exists, false, "storage_destination_collision");
    // Fixture-only preflight; a real adapter needs atomic generation preconditions.
    await uploadBytes(to, before, copied);
  }
  await uploadBytes(to, new TextEncoder().encode("Destination-owned synthetic object"));
  await assert.rejects(copyAbsent, /storage_destination_collision/);
  assert.equal(new TextDecoder().decode(await getBytes(to)), "Destination-owned synthetic object");
  // Use a fresh reviewed object key; never delete/overwrite the collision.
  const freshKey = `synthetic/${crypto.randomUUID()}/reference.txt`;
  const freshSource = ref(sourceStorage, freshKey);
  await uploadBytes(freshSource, before, copied);
  const fresh = ref(targetStorage, freshKey);
  await uploadBytes(fresh, before, copied);
  assert.deepEqual(new Uint8Array(await getBytes(fresh)), bytes);
  assert.deepEqual(new Uint8Array(await getBytes(from)), bytes);
  const after = await getMetadata(fresh);
  assert.equal(after.fullPath, freshSource.fullPath); assert.notEqual(after.bucket, metadata.bucket);
  assert.equal(after.contentType, metadata.contentType); assert.equal(after.customMetadata.ownerUid, OWNER);
});

test("target writes after cutover prevent a blind source rollback and source stays unchanged", async () => {
  const before = await originals(pair.source.db); await copy();
  await pair.target.db.doc("messages/target-new-message").create({ clientUid: OWNER, body: "Synthetic destination-only reply" });
  assert.equal((await pair.source.db.doc("messages/target-new-message").get()).exists, false);
  assert.deepEqual(await originals(pair.source.db), before);
  const destinationOnly = await pair.target.db.collection("messages").get();
  assert.ok(destinationOnly.docs.some(d => d.id === "target-new-message"));
  // There is deliberately no reverse-sync or switch-back operation in this harness.
  await assert.rejects(copy(), /destination_collision/);
});


test("an in-memory synthetic backup restores a corrupted destination document with exact logical types", async () => {
  const path = "projects/rehearsal-reference";
  const backup = (await pair.source.db.doc(path).get()).data();
  const originalHash = fingerprint(logical(backup));
  await copy();
  await pair.target.db.doc(path).set({ projectName: "Synthetic corruption for recovery rehearsal" });
  assert.notEqual(fingerprint(logical((await pair.target.db.doc(path).get()).data())), originalHash);
  await pair.target.db.doc(path).set(rebind(backup, pair.target.db));
  assert.equal(fingerprint(logical((await pair.target.db.doc(path).get()).data())), originalHash);
  assert.equal(fingerprint(logical((await pair.source.db.doc(path).get()).data())), originalHash);
});

test("pre-write rollback can withdraw reviewed views while retaining both private originals and imported identities", async () => {
  const before = await originals(pair.source.db); await copy();
  await pair.target.db.doc("projects/destination-owned").create({ marker: "Keep destination-owned original" });
  await publishApprovedFixture(pair, paths, "PUBLISH_REVIEWED_SYNTHETIC_VIEWS");
  for (const path of APPROVED_PATHS) {
    const [name, id] = path.split("/");
    const view = pair.target.db.doc(`portalRecords/${name}/records/${id}`);
    const data = (await view.get()).data();
    // Only exact fixture-created views are removed; no source/Auth deletion.
    assert.equal(fingerprint(data), fingerprint(candidateProjection(name, (await pair.target.db.doc(path).get()).data())));
    await view.delete();
  }
  assert.deepEqual(await originals(pair.source.db), before);
  assert.equal((await pair.target.auth.listUsers()).users.length, 5);
  assert.equal((await pair.target.db.doc("projects/destination-owned").get()).exists, true);
  assert.equal((await pair.target.db.doc("payments/rehearsal-payment").get()).data().amountCents, 12345);
  assert.equal((await pair.target.db.doc(`portalRecords/clients/records/${OWNER}`).get()).exists, false);
});

test("admin privilege needs a separate destination approval and studio creation never creates or links Auth", async () => {
  await copy();
  const adminDb = targetEnv.authenticatedContext(REVIEWER).firestore();
  await assert.rejects(getDoc(doc(adminDb, `clients/${OWNER}`)), { code: "permission-denied" });
  // Explicit synthetic privilege review, separate from the copy operation.
  await pair.target.db.doc(`adminUsers/${REVIEWER}`).create({ active: true, approvedForSyntheticTest: true });
  assert.equal((await getDoc(doc(adminDb, `clients/${OWNER}`))).data().clientUid, OWNER);
  const beforeUsers = (await pair.target.auth.listUsers()).users.map(u => u.uid).sort();
  const { saveStudioClient } = await import("../../lib/clients/clientService.mjs");
  const file = await saveStudioClient(pair.target.db, REVIEWER, { client: { name: "Synthetic migrated walk-in", email: `${OWNER}@example.test`, phone: "5551112222", instagram: "synthetic_walkin", preferredArtist: "ben", status: "lead", studioNotes: "Private synthetic migrated studio notes" } });
  assert.deepEqual((await pair.target.auth.listUsers()).users.map(u => u.uid).sort(), beforeUsers);
  assert.equal((await pair.target.db.doc(`studioClients/${file.id}`).get()).data().clientUid, undefined);
  assert.equal((await pair.target.db.doc(`portalRecords/clients/records/${file.id}`).get()).exists, false);
  await assert.rejects(getDoc(doc(targetDb, `studioClients/${file.id}`)), { code: "permission-denied" });
});
