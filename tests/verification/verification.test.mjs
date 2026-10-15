import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeApp as initBrowser, deleteApp as deleteBrowser } from "firebase/app";
import { getAuth as clientAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateEmail, getIdTokenResult } from "firebase/auth";
import { getFirestore as clientDb, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { firebaseEnvironment, DEMO_PROJECT_ID } from "../../lib/firebaseEnvironment.mjs";
import { verifyFirebaseBearerToken } from "../../lib/payments/firebaseBearerAuth.js";
import { handleVerification, verificationConfig, verificationLimit } from "../../lib/verification/server.mjs";
import { requestVerification, verifyAfterRegistration, refreshVerification, verificationAction, inspectVerification, completeVerification, verificationError } from "../../lib/verification/client.mjs";
import { discoverNotifications, processNotifications } from "../../lib/notifications/queue.mjs";
import { notificationConfig } from "../../lib/notifications/config.mjs";
let app, db, auth, browser, ba, bd, user;
const password = "Synthetic-verification-only-123!";
const authenticate = request => verifyFirebaseBearerToken(request, auth.verifyIdToken.bind(auth));
async function call({ uidUser = user, method = "POST", body, token, now, fetcher } = {}) {
  return handleVerification(new Request("http://localhost/api/auth/verification", { method, headers: { ...(uidUser || token ? { Authorization: `Bearer ${token || await uidUser.getIdToken()}` } : {}) }, ...(body !== undefined ? { body } : {}) }), { auth, firestore: db, authenticate, env: {}, ...(now !== undefined ? { now } : {}), ...(fetcher ? { fetcher } : {}) });
}
async function codes(uid = user.uid) {
  const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${DEMO_PROJECT_ID}/oobCodes`);
  assert.ok(response.ok);
  return (await response.json()).oobCodes.filter(code => code.email === `${uid}@example.test` && code.requestType === "VERIFY_EMAIL");
}
async function fresh(name) {
  const uid = `verification-${name}`;
  await auth.createUser({ uid, email: `${uid}@example.test`, password });
  await signInWithEmailAndPassword(ba, `${uid}@example.test`, password);
  return ba.currentUser;
}
before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  app = initializeApp({ projectId: DEMO_PROJECT_ID }, "verification-server"); db = getFirestore(app); auth = getAuth(app);
  browser = initBrowser(firebaseEnvironment().config, "verification-browser"); ba = clientAuth(browser); connectAuthEmulator(ba, "http://127.0.0.1:9099", { disableWarnings: true });
  bd = clientDb(browser); connectFirestoreEmulator(bd, "127.0.0.1", 8080);
});
let index = 0;
beforeEach(async () => {
  assert.ok((await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" })).ok);
  await db.doc("systemControls/writeFence").set({ schemaVersion: 1, state: "open", epoch: "test", writerProtocol: 1 });
  user = await fresh(String(index++));
});
after(async () => { await deleteBrowser(browser); await deleteApp(app); });

test("new and existing password users receive an emulator-only verification link for their own account", async () => {
  const response = await call(); assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { sent: true, verified: false, retryAfter: 60 });
  const issued = await codes(); assert.equal(issued.length, 1);
  assert.equal(issued[0].email, user.email); assert.equal(new URL(issued[0].oobLink).searchParams.get("continueUrl"), "http://localhost:3000/portal/verify-email");
  assert.equal((await auth.getUser(user.uid)).emailVerified, false);
});
test("valid emulator code verifies ownership and refreshes user and ID-token claims without changing UID/history", async () => {
  const uid = user.uid;
  await db.doc(`portalRecords/clients/records/${uid}`).set({ clientUid: uid, clientName: "Synthetic preserved" });
  await db.doc("payments/verification-history").set({ clientUid: uid, amountCents: 12500, createdAt: new Date(1000) });
  const original = (await db.doc("payments/verification-history").get()).data();
  await call(); const code = (await codes())[0].oobCode;
  assert.equal(await inspectVerification(ba, code), user.email);
  const result = await completeVerification(ba, code);
  assert.equal(result.account.uid, uid); assert.equal(result.account.verified, true);
  assert.equal((await getIdTokenResult(user)).claims.email_verified, true);
  assert.equal((await auth.getUser(uid)).emailVerified, true);
  assert.deepEqual((await db.doc("payments/verification-history").get()).data(), original);
  assert.equal((await getDoc(doc(bd, "portalRecords", "clients", "records", uid))).data().clientName, "Synthetic preserved");
});
test("replayed and invalid links do not change verification state; expired SDK errors have recoverable guidance", async () => {
  await call(); const code = (await codes())[0].oobCode;
  await completeVerification(ba, code);
  await assert.rejects(completeVerification(ba, code), error => ["auth/invalid-action-code", "auth/expired-action-code"].includes(error.code));
  await assert.rejects(completeVerification(ba, "synthetic-invalid-code"));
  assert.match(verificationError({ code: "auth/expired-action-code" }), /expired.*fresh link/);
  assert.match(verificationError({ code: "auth/invalid-action-code" }), /invalid, expired, or already used/);
});
test("wrong signed-in account cannot consume a verification link", async () => {
  await call(); const code = (await codes())[0].oobCode, first = user.uid;
  const other = await fresh("wrong-account");
  await assert.rejects(completeVerification(ba, code), /wrong_verification_account/);
  assert.equal((await auth.getUser(first)).emailVerified, false); assert.equal((await auth.getUser(other.uid)).emailVerified, false);
});
test("a valid link works signed out, then a later sign-in sees the verified status", async () => {
  await call(); const code = (await codes())[0].oobCode, email = user.email;
  await signOut(ba);
  assert.equal((await completeVerification(ba, code)).account, null);
  await signInWithEmailAndPassword(ba, email, password);
  assert.equal((await refreshVerification(ba)).verified, true);
});
test("returning to the portal refreshes verification completed in a different tab", async () => {
  await auth.updateUser(user.uid, { emailVerified: true });
  assert.equal(user.emailVerified, false);
  const current = await refreshVerification(ba);
  assert.equal(current.verified, true); assert.equal((await getIdTokenResult(user)).claims.email_verified, true);
});
test("simultaneous sends reserve one cooldown slot and cannot duplicate emulator email", async () => {
  const now = Date.now();
  const responses = await Promise.all([call({ now }), call({ now }), call({ now })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [202, 429, 429]);
  assert.equal((await codes()).length, 1);
  const status = await call({ method: "GET", now: now + 1000 });
  assert.equal((await status.json()).retryAfter, 59);
});
test("cooldown survives browser reload and five-per-day budget survives address changes", async () => {
  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await call({ now: now + attempt * 60000 }); assert.equal(response.status, 202);
  }
  const denied = await call({ now: now + 5 * 60000 }); assert.equal(denied.status, 429);
  assert.ok((await denied.json()).retryAfter > 60000);
  await auth.updateUser(user.uid, { email: "changed-cooldown@example.test", emailVerified: false });
  assert.equal((await call({ now: now + 6 * 60000 })).status, 429);
  assert.equal((await verificationLimit(db, user.uid, { now: now + 86400000 })).retryAfter, 0);
});
test("provider failure consumes the cooldown and budget, preserving a valid account", async () => {
  const response = await call({ fetcher: async () => { throw new Error("Synthetic provider outage"); } });
  assert.equal(response.status, 503); assert.equal((await call()).status, 429);
  assert.equal((await auth.getUser(user.uid)).emailVerified, false);
});
test("signup helper uses authenticated server send and never throws when delivery is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => url === "/api/auth/verification" ? handleVerification(new Request("http://localhost/api/auth/verification", options), { auth, firestore: db, authenticate, env: {} }) : originalFetch(url, options);
  try { assert.equal((await verifyAfterRegistration(user)).sent, true); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal((await requestVerification(user, { fetcher: async () => { throw new Error("offline"); } })).error, "verification_temporarily_unavailable");
  assert.equal((await verifyAfterRegistration(null)).error, "sign_in_required");
});
test("forged requests, arbitrary recipients, disabled accounts and nonsynthetic local email cannot send", async () => {
  for (const options of [{ uidUser: null }, { token: "forged", uidUser: null }]) assert.equal((await call(options)).status, 401);
  for (const body of ['{"email":"arbitrary@example.test"}', '{"continueUrl":"https://external.example"}', '{}']) assert.equal((await call({ body })).status, 400);
  await auth.updateUser(user.uid, { disabled: true }); assert.ok([401, 403].includes((await call()).status));
  await auth.updateUser(user.uid, { disabled: false, email: "synthetic@external.invalid" });
  assert.equal((await call()).status, 403); assert.equal((await codes()).length, 0);
});
test("already verified accounts are idempotent and create no further verification email", async () => {
  await auth.updateUser(user.uid, { emailVerified: true });
  const response = await call(); assert.equal(response.status, 200); assert.equal((await response.json()).verified, true);
  assert.equal((await codes()).length, 0);
});
test("verification limiter documents cannot be read or reset by signed-in users or browser admins", async () => {
  await call(); const ref = (await db.collection("authVerificationRateLimits").get()).docs[0];
  for (const active of [false, true]) {
    await db.doc(`adminUsers/${user.uid}`).set({ active });
    const browserRef = doc(bd, ref.ref.path);
    for (const operation of [() => getDoc(browserRef), () => setDoc(browserRef, { count: 0 }), () => updateDoc(browserRef, { count: 0 }), () => deleteDoc(browserRef)]) await assert.rejects(operation(), { code: "permission-denied" });
  }
});
test("new signup preserves portal access and unverified accounts still cannot receive client notifications", async () => {
  const credential = await createUserWithEmailAndPassword(ba, "signup-verification@example.test", password), uid = credential.user.uid;
  assert.equal(credential.user.emailVerified, false);
  await db.doc(`portalRecords/clients/records/${uid}`).set({ clientUid: uid, clientName: "Synthetic history" });
  assert.ok((await getDoc(doc(bd, "portalRecords", "clients", "records", uid))).exists());
  await db.doc("consultRequests/unverified-new-signup").set({ clientUid: uid });
  await db.doc("portalRecords/consultRequests/records/unverified-new-signup").set({ clientUid: uid });
  await db.doc("publicationRecords/consultRequests/records/unverified-new-signup").set({ schemaVersion: 1, state: "approved", approved: { clientUid: uid } });
  const config = notificationConfig({ NOTIFICATIONS_MODE: "test", NOTIFICATION_ACTIVATED_AT: new Date(Date.now() - 1000).toISOString() });
  await discoverNotifications(db, config); const sent = [];
  await processNotifications(db, auth, config, async (envelope, id) => { sent.push(envelope); return { id }; });
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].to, ["studio@example.test"]);
  const queue = (await db.collection("notificationQueue").get()).docs;
  assert.ok(queue.some(item => item.data().reason === "verified_email_required"));
});
test("changing a verified email resets verification instead of trusting the old mailbox", async () => {
  await auth.updateUser(user.uid, { emailVerified: true }); await refreshVerification(ba);
  assert.equal(user.emailVerified, true);
  await updateEmail(user, "new-unverified-address@example.test");
  const state = await refreshVerification(ba);
  assert.equal(state.email, "new-unverified-address@example.test"); assert.equal(state.verified, false);
  assert.equal((await getIdTokenResult(user)).claims.email_verified, false);
});
test("action parsing rejects other modes/projects/tenants and ignores untrusted redirects", () => {
  assert.equal(verificationAction("", "key"), null);
  assert.equal(verificationAction("?mode=verifyEmail&oobCode=synthetic-code&apiKey=key&continueUrl=https://external.example", "key"), "synthetic-code");
  for (const query of ["mode=resetPassword&oobCode=code", "mode=verifyAndChangeEmail&oobCode=code", "mode=verifyEmail&oobCode=code&apiKey=other", "mode=verifyEmail&oobCode=code&tenantId=other", "mode=verifyEmail&oobCode=code&oobCode=other", "mode=verifyEmail&oobCode=../bad"]) assert.throws(() => verificationAction(query, "key"));
});
test("production verification is separately disabled and local origin cannot target a live service", () => {
  assert.equal(verificationConfig({}).emulator, true);
  for (const patch of [{ EMAIL_VERIFICATION_ORIGIN: "https://external.example" }, { NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fawcett-website-sandbox" }, { EMAIL_VERIFICATION_ORIGIN: "http://localhost:3000/?redirect=other" }]) assert.throws(() => verificationConfig(patch));
  const production = { NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_FIREBASE_MODE: "production", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fawcett-website-sandbox", NEXT_PUBLIC_FIREBASE_API_KEY: "synthetic-key" };
  assert.deepEqual(verificationConfig(production), { enabled: false });
});

test("an old-address verification code cannot verify a newer address when the browser state is stale", async () => {
  await call(); const code = (await codes())[0].oobCode;
  await auth.updateUser(user.uid, { email: "stale-changed@example.test", emailVerified: false });
  await assert.rejects(completeVerification(ba, code), /wrong_verification_account/);
  assert.equal((await auth.getUser(user.uid)).emailVerified, false);
});

test("deleting and recreating an account cannot bypass the destination mailbox cooldown", async () => {
  const now = Date.now(), email = user.email;
  assert.equal((await call({ now })).status, 202);
  await auth.deleteUser(user.uid); await signOut(ba);
  const recreated = await createUserWithEmailAndPassword(ba, email, password);
  const response = await call({ uidUser: recreated.user, now: now + 1000 });
  assert.equal(response.status, 429); assert.equal((await response.json()).retryAfter, 59);
});

test("rolling daily quotas cannot be bypassed by a burst on either side of a window boundary", async () => {
  const now = Date.now(), hour = 3600000;
  const fetcher = async () => new Response("{}", { status: 200 });
  for (const offset of [0, 23 * hour, 23 * hour + 60000, 23 * hour + 120000, 23 * hour + 180000]) assert.equal((await call({ now: now + offset, fetcher })).status, 202);
  assert.equal((await call({ now: now + 24 * hour, fetcher })).status, 202);
  assert.equal((await call({ now: now + 24 * hour + 60000, fetcher })).status, 429);
});
