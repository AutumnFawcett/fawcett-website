import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeApp as browserApp, deleteApp as deleteBrowser } from "firebase/app";
import { getAuth as browserAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore as browserDb, connectFirestoreEmulator, doc, getDocFromServer, setDoc } from "firebase/firestore";
import { firebaseEnvironment, DEMO_PROJECT_ID, serverFirebaseEnvironment } from "../../lib/firebaseEnvironment.mjs";
import { OPEN_EMULATOR_FENCE } from "../../lib/safety/writeFence.mjs";
import { fencedFirestore } from "../../lib/safety/serverFence.mjs";
import { recordStudioPayment, handleStudioPaymentRequest, listStudioPayments } from "../../lib/studioPayments/service.mjs";
import { processSquareWebhook } from "../../lib/payments/webhookProcessor.js";
import { handleSquareWebhook } from "../../lib/payments/squareWebhookHandler.js";
import { createHmac } from "node:crypto";
import { fingerprint } from "../../lib/migration/model.mjs";
// server-only modules are deliberately not imported; exercise equivalent storage
// contracts against the real emulator using the same guarded transaction facade.
let app, db, guarded, auth, browser, ba, bd, providerCalls;
const admin = "studio-test-admin", client = "studio-test-client", other = "studio-test-other";
const config = { paymentsEnabled: true, environment: "sandbox", locationId: "synthetic-location", redirectUrl: "http://localhost:3000/payments/return", acknowledgementVersion: "synthetic-studio-v1" };
const manual = extra => ({ action: "manual", requestId: "synthetic-request-0001", studioClientId: "walkin", amountCents: 12345, currency: "CAD", kind: "deposit", paymentMethod: "square_dashboard", receivedDate: "2026-10-15", reference: "Synthetic invoice receipt", notes: "Private fictional note", reviewed: true, ...extra });
const checkout = extra => ({ action: "checkout", requestId: "synthetic-checkout-0001", studioClientId: "walkin", amountCents: 1000, currency: "CAD", kind: "deposit", reviewed: true, ...extra });
const provider = { async createPaymentLink({ order }) { providerCalls++; return { paymentLink: { id: "synthetic-link", orderId: `square-${order.orderId}`, url: "https://sandbox.square.link/synthetic" }, order: { totalMoney: { amount: BigInt(order.amountCents), currency: "CAD" } } }; } };
function storage() { return {
  async attachProviderIdentity(id, identity, now) { await guarded.runTransaction(async tx => { const ref = guarded.doc(`paymentOrders/${id}`), row = await tx.get(ref); if (row.data().status !== "creating") throw new Error("identity_conflict"); tx.update(ref, { ...identity, status: "pending", updatedAt: now }); }); },
  async markCreationFailed(id, code, now) { await guarded.doc(`paymentOrders/${id}`).update({ status: "creation_failed", failureCode: code, updatedAt: now }); },
}; }
const run = (input, overrides = {}) => recordStudioPayment({ firestore: db, auth, uid: admin, input, config, provider, orderStorage: storage(), ...overrides });
async function eventFor(id, type = "charge", eventId = `${type}-event`) {
  const order = (await db.doc(`paymentOrders/${id}`).get()).data();
  if (type === "charge") return { event_id: eventId, type: "payment.updated", data: { object: { payment: { id: "synthetic-payment", order_id: order.providerOrderId, location_id: config.locationId, status: "COMPLETED", amount_money: { amount: order.amountCents, currency: "CAD" } } } } };
  if (type === "refund") return { event_id: eventId, type: "refund.updated", data: { object: { refund: { id: "synthetic-refund", payment_id: "synthetic-payment", order_id: order.providerOrderId, location_id: config.locationId, status: "COMPLETED", amount_money: { amount: 400, currency: "CAD" } } } } };
  return { event_id: eventId, type: "dispute.created", data: { object: { dispute: { id: "synthetic-dispute", state: "EVIDENCE_REQUIRED", location_id: config.locationId, disputed_payment: { payment_id: "synthetic-payment" }, amount_money: { amount: 600, currency: "CAD" } } } } };
}
const processEvent = event => processSquareWebhook({ firestore: guarded, environment: "sandbox", locationId: config.locationId, event, rawBody: JSON.stringify(event), now: () => Timestamp.now() });
before(async () => {
  assert.equal(serverFirebaseEnvironment(process.env).mode, "emulator");
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  app = initializeApp({ projectId: DEMO_PROJECT_ID }, "studio-payment-tests"); db = getFirestore(app); guarded = fencedFirestore(db); auth = getAuth(app);
  for (const uid of [admin, client, other]) await auth.createUser({ uid, email: `${uid}@example.test`, password: "Synthetic-only-123!" });
  browser = browserApp(firebaseEnvironment().config, "studio-payment-browser"); ba = browserAuth(browser); bd = browserDb(browser);
  connectAuthEmulator(ba, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(bd, "127.0.0.1", 8080);
});
beforeEach(async () => {
  assert.ok((await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" })).ok);
  await db.doc("systemControls/writeFence").set(OPEN_EMULATOR_FENCE);
  await db.doc(`adminUsers/${admin}`).set({ active: true });
  await db.doc("studioClients/walkin").set({ name: "Fictional Walk In", status: "lead" });
  await db.doc("studioClients/second").set({ name: "Other Fictional Client", status: "lead" });
  providerCalls = 0;
});
after(async () => { await deleteBrowser(browser); await deleteApp(app); });
test("manual studio client requires no Auth account, remains unconfirmed and creates one private audit", async () => {
  const before = (await auth.listUsers()).users.length;
  const result = await run(manual());
  assert.equal(result.status, "recorded"); assert.equal(result.providerConfirmed, false);
  const row = (await db.doc(`studioPayments/${result.id}`).get()).data();
  assert.equal(row.clientUid, null); assert.equal(row.studioClientId, "walkin"); assert.equal(row.amountCents, 12345);
  assert.equal((await db.collection(`studioPayments/${result.id}/audit`).get()).size, 1);
  for (const root of ["portalRecords", "creditLedger", "founderProfiles", "paymentTransactions"]) assert.equal((await db.collection(root).get()).size, 0);
  assert.equal((await auth.listUsers()).users.length, before); assert.equal(providerCalls, 0);
});
test("concurrent manual retries produce one record and audit; changed amount/client/actor cannot reuse ID", async () => {
  const results = await Promise.all([run(manual()), run(manual()), run(manual())]);
  assert.equal(new Set(results.map(x => x.id)).size, 1);
  assert.equal((await db.collection("studioPayments").get()).size, 1);
  for (const changes of [{ amountCents: 1 }, { studioClientId: "second" }, { notes: "changed" }]) await assert.rejects(run(manual(changes)), /request_conflict/);
});
test("rejects forged identity, provider-paid status, credits, noninteger money, currency and unreviewed requests", async () => {
  for (const changes of [{ clientUid: "walkin" }, { status: "paid" }, { providerConfirmed: true }, { creditHandling: "adds_credit" }, { amountCents: 1.2 }, { amountCents: 0 }, { amountCents: Number.MAX_SAFE_INTEGER }, { currency: "USD" }, { reviewed: false }, { receivedDate: "2026-02-30" }, { studioClientId: "missing" }]) await assert.rejects(run(manual(changes)));
  assert.equal((await db.collection("studioPayments").get()).size, 0);
});
test("only a unique independently verified link to the same current Auth account permits optional UID", async () => {
  const account = await auth.getUser(client);
  const evidence = { state: "verified", studioClientId: "walkin", clientUid: client, reviewedBy: admin, reviewedAt: Timestamp.now(), accountCreatedAt: account.metadata.creationTime };
  await db.doc("studioVerifiedAccountLinks/walkin").set(evidence);
  const result = await run(manual({ clientUid: client })); assert.equal((await db.doc(`studioPayments/${result.id}`).get()).data().clientUid, client);
  await assert.rejects(run(manual({ requestId: "synthetic-uid-request2", clientUid: other })), /verified_account_link_required/);
  await db.doc("studioVerifiedAccountLinks/second").set({ ...evidence, studioClientId: "second" });
  await assert.rejects(run(manual({ requestId: "synthetic-uid-request3", clientUid: client })), /account_link_conflict/);
});
async function project() {
  const value = { projectName: "Synthetic reviewed project", studioClientId: "walkin", updatedAt: Timestamp.now() };
  await db.doc("projects/project1").set(value);
  await db.doc("studioProjectAssociations/project1").set({ state: "approved", studioClientId: "walkin", projectId: "project1", projectFingerprint: fingerprint(value), reviewedBy: admin, reviewedAt: Timestamp.now() });
}
test("project associations fail closed on missing evidence, cross-client selection and changed project", async () => {
  await assert.rejects(run(manual({ projectId: "project1" })));
  await project(); await run(manual({ projectId: "project1" }));
  await assert.rejects(run(manual({ requestId: "synthetic-project-second", studioClientId: "second", projectId: "project1" })));
  await db.doc("projects/project1").update({ projectName: "Changed" });
  await assert.rejects(run(manual({ projectId: "project1" })), /reviewed_project_association_required/);
});
test("active admin only, including server handler and read endpoints", async () => {
  for (const uid of [client, other]) {
    await assert.rejects(run(manual(), { uid }), /access_denied/);
    await assert.rejects(listStudioPayments(db, uid), /access_denied/);
    const response = await handleStudioPaymentRequest(new Request("http://localhost/api/admin/studio-payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checkout()) }), { firestore: db, authenticate: async () => uid, checkoutDependencies: () => { throw new Error("must not construct provider"); } });
    assert.equal(response.status, 403);
  }
});
test("manual records, audit, requests and account evidence deny direct browser reads/writes even to admins", async () => {
  const result = await run(manual());
  for (const uid of [client, other, admin]) {
    await signInWithEmailAndPassword(ba, `${uid}@example.test`, "Synthetic-only-123!");
    for (const path of [`studioPayments/${result.id}`, `studioPayments/${result.id}/audit/created`, `studioPaymentRequests/${result.id}`, "studioVerifiedAccountLinks/walkin", "studioProjectAssociations/project1"]) {
      await assert.rejects(getDocFromServer(doc(bd, path)), { code: "permission-denied" });
      await assert.rejects(setDoc(doc(bd, path), { forged: true }), { code: "permission-denied" });
    }
  }
});
test("disabled checkout and maintenance never invoke provider or reserve payment", async () => {
  await assert.rejects(run(checkout(), { config: { paymentsEnabled: false } }), /payments_disabled/);
  await db.doc("systemControls/writeFence").delete();
  await assert.rejects(run(manual()), { code: "maintenance" }); await assert.rejects(run(checkout()), { code: "maintenance" });
  assert.equal(providerCalls, 0); assert.equal((await db.collection("paymentOrders").get()).size, 0);
});
test("hosted retries reuse one order/link and safe generic item contains no client/private content", async () => {
  const first = await run(checkout()), second = await run(checkout());
  assert.equal(first.id, second.id); assert.equal(first.checkoutUrl, second.checkoutUrl); assert.equal(providerCalls, 1);
  const row = (await db.doc(`paymentOrders/${first.id}`).get()).data();
  assert.equal(row.purpose, "tattoo_payment"); assert.equal(row.clientUid, null); assert.equal(row.itemName, "Tattoo deposit");
  await assert.rejects(run(checkout({ amountCents: 2000 })), /request_conflict/);
});
test("ambiguous provider outcome keeps original order and retry key; later retry recovers", async () => {
  let original;
  await assert.rejects(run(checkout(), { provider: { createPaymentLink: async ({ order }) => { original = order; throw new Error("synthetic interruption"); } } }), /checkout_outcome_unknown/);
  const recovered = await run(checkout()); assert.equal(recovered.id, original.orderId);
  assert.equal((await db.collection("paymentOrders").get()).size, 1);
});
test("concurrent hosted retries may need retry after attachment conflict but never allocate a second internal order", async () => {
  const results = await Promise.allSettled([run(checkout()), run(checkout())]);
  assert.ok(results.some(r => r.status === "fulfilled"));
  assert.equal((await db.collection("paymentOrders").get()).size, 1);
  assert.equal((await db.collection("studioPaymentRequests").get()).size, 1);
  await run(checkout());
});
test("verified webhook charge/refund/dispute preserve studio and reviewed project identity without Founder effects", async () => {
  await project(); const order = await run(checkout({ projectId: "project1" }));
  for (const type of ["charge", "refund", "dispute"]) {
    const event = await eventFor(order.id, type);
    const result = await processEvent(event); assert.equal(result.outcome, "processed", JSON.stringify(result));
    await processEvent(event);
  }
  const transactions = await db.collection("paymentTransactions").get(); assert.equal(transactions.size, 3);
  const report = await listStudioPayments(db, admin); assert.equal(report.transactions.length, 3);
  for (const uid of [client, other]) {
    await signInWithEmailAndPassword(ba, `${uid}@example.test`, "Synthetic-only-123!");
    await assert.rejects(getDocFromServer(doc(bd, `paymentOrders/${order.id}`)), { code: "permission-denied" });
    await assert.rejects(getDocFromServer(doc(bd, `paymentTransactions/${transactions.docs[0].id}`)), { code: "permission-denied" });
  }
  for (const doc of transactions.docs) { assert.equal(doc.data().studioClientId, "walkin"); assert.equal(doc.data().projectId, "project1"); assert.ok(doc.data().projectAssociationHash); assert.equal(doc.data().purpose, "tattoo_payment"); }
  for (const doc of (await db.collection("paymentWebhookEvents").get()).docs) assert.equal(doc.data().studioClientId, "walkin");
  assert.equal((await db.collection("founderProfiles").get()).size, 0); assert.equal((await db.collection("creditLedger").get()).size, 0);
});
test("forged webhook signature and amount mismatch cannot confirm studio payment", async () => {
  const order = await run(checkout()), event = await eventFor(order.id);
  const raw = JSON.stringify(event), signatureKey = "synthetic-signature", notificationUrl = "https://example.test/square";
  const response = signature => handleSquareWebhook({ request: new Request(notificationUrl, { method: "POST", headers: { "x-square-hmacsha256-signature": signature }, body: raw }), config: { ...config, webhookSignatureKey: signatureKey, notificationUrl }, firestore: guarded, now: () => Timestamp.now() });
  assert.equal((await response("forged")).status, 401);
  assert.equal((await response(createHmac("sha256", signatureKey).update(notificationUrl + raw).digest("base64"))).status, 200);
  const bad = await eventFor(order.id, "charge", "wrong-amount"); bad.data.object.payment.amount_money.amount = 1;
  assert.equal((await processEvent(bad)).outcome, "invalid");
  assert.equal((await db.collection("paymentTransactions").get()).size, 1);
});

test("a receipt cannot be recorded again under a new request or another studio client", async () => {
  await run(manual());
  await assert.rejects(run(manual({ requestId: "synthetic-duplicate-receipt", studioClientId: "second" })), /reference_already_recorded/);
  assert.equal((await db.collection("studioPayments").get()).size, 1);
});
test("a pending request cannot change between hosted checkout and manual recording", async () => {
  await run(checkout());
  await assert.rejects(run(manual({ requestId: "synthetic-checkout-0001" })), /request_conflict/);
});
test("attachment interruption is recovered from the same provider idempotency key", async () => {
  const keys = [];
  const transport = { async createPaymentLink(values) { keys.push(values.order.idempotencyKey); return provider.createPaymentLink(values); } };
  await assert.rejects(run(checkout(), { provider: transport, orderStorage: { ...storage(), attachProviderIdentity: async () => { throw new Error("synthetic commit interruption"); } } }), /checkout_persistence_pending/);
  await run(checkout(), { provider: transport });
  assert.equal(new Set(keys).size, 1); assert.equal((await db.collection("paymentOrders").get()).size, 1);
});
test("malformed provider response never exposes a link or creates a charge", async () => {
  await assert.rejects(run(checkout(), { provider: { createPaymentLink: async () => ({ paymentLink: { id: "bad", orderId: "bad", url: "https://attacker.example.test" } }) } }), /checkout_response_invalid/);
  await assert.rejects(run(checkout()), /reconciliation_required/);
  assert.equal((await db.collection("paymentTransactions").get()).size, 0);
});
test("anonymous and revoked admin requests cannot read the private report", async () => {
  const request = new Request("http://localhost/api/admin/studio-payments");
  const anonymous = await handleStudioPaymentRequest(request, { firestore: db, authenticate: async () => { throw new Error("no token"); } });
  assert.equal(anonymous.status, 403);
  await db.doc(`adminUsers/${admin}`).update({ active: false });
  await assert.rejects(run(manual()), /access_denied/);
});
test("private API validates content type, request size, unknown fields and supports authenticated read-only reporting", async () => {
  const dependencies = { firestore: db, auth, authenticate: async () => admin };
  const post = (body, type = "application/json") => new Request("http://localhost/api/admin/studio-payments", { method: "POST", headers: { "Content-Type": type }, body });
  assert.equal((await handleStudioPaymentRequest(post("{}", "text/plain"), dependencies)).status, 415);
  assert.equal((await handleStudioPaymentRequest(post("x".repeat(12001)), dependencies)).status, 413);
  assert.equal((await handleStudioPaymentRequest(post("bad-json"), dependencies)).status, 400);
  assert.equal((await handleStudioPaymentRequest(post(JSON.stringify(manual({ arbitraryRecipient: "other@example.test" }))), dependencies)).status, 400);
  assert.equal((await handleStudioPaymentRequest(post(JSON.stringify(manual())), dependencies)).status, 200);
  await db.doc("systemControls/writeFence").delete();
  const response = await handleStudioPaymentRequest(new Request("http://localhost/api/admin/studio-payments"), dependencies);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const result = await response.json(); assert.equal(result.payments.length, 1); assert.equal(result.payments[0].audit.length, 1);
});
test("maintenance during provider response blocks attachment and resumes using the same reserved order", async () => {
  await assert.rejects(run(checkout(), { provider: { async createPaymentLink(values) {
    const result = await provider.createPaymentLink(values);
    await db.doc("systemControls/writeFence").set({ ...OPEN_EMULATOR_FENCE, state: "maintenance", epoch: "synthetic-mid-checkout" });
    return result;
  } } }), /checkout_persistence_pending/);
  const order = (await db.collection("paymentOrders").get()).docs[0]; assert.equal(order.data().status, "creating");
  await db.doc("systemControls/writeFence").set({ ...OPEN_EMULATOR_FENCE, epoch: "synthetic-reopen" });
  const result = await run(checkout()); assert.equal(result.id, order.id); assert.equal(result.status, "pending");
});
test("webhook-supplied client/project claims cannot override the trusted studio order", async () => {
  const result = await run(checkout());
  const event = await eventFor(result.id);
  Object.assign(event.data.object.payment, { studioClientId: "second", clientUid: other, projectId: "forged-project" });
  assert.equal((await processEvent(event)).outcome, "processed");
  const row = (await db.collection("paymentTransactions").get()).docs[0].data();
  assert.equal(row.studioClientId, "walkin"); assert.equal(row.clientUid, undefined); assert.equal(row.projectId, undefined);
});
test("changed stored order ownership stops retry without another provider request", async () => {
  const result = await run(checkout());
  await db.doc(`paymentOrders/${result.id}`).update({ clientUid: other });
  await assert.rejects(run(checkout()), /order_identity_conflict/);
  assert.equal(providerCalls, 1);
});
