import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeApp as browserApp, deleteApp as deleteBrowser } from "firebase/app";
import { getAuth as browserAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore as browserDb, connectFirestoreEmulator, doc, getDocFromServer, setDoc, updateDoc } from "firebase/firestore";
import { firebaseEnvironment, serverFirebaseEnvironment, DEMO_PROJECT_ID } from "../../lib/firebaseEnvironment.mjs";
import { OPEN_EMULATOR_FENCE } from "../../lib/safety/writeFence.mjs";
import { proposedPolicy, localInstant, policyInput } from "../../lib/scheduling/model.mjs";
import { mutateSchedule, scheduleReport, handleScheduleRequest } from "../../lib/scheduling/service.mjs";
import { fingerprint } from "../../lib/migration/model.mjs";
import { reviewPublication } from "../../lib/safety/publication.mjs";
let app, db, auth, browser, ba, bd, serial = 0;
const staff = "schedule-admin", alice = "schedule-alice", bob = "schedule-bob";
const request = () => `synthetic-schedule-${++serial}`;
const week = () => Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, [{ start: "09:00", end: "18:00" }]]));
function policy() { return { ...proposedPolicy(), enabled: true, timezoneApproved: true, transitionReviewed: true, studioHours: week(), artistHours: { ben: week(), autumn: week() } }; }
const appointment = extra => ({ studioClientId: "walkin", clientUid: null, projectId: null, artistId: "ben", appointmentType: "tattoo_session", title: "Synthetic tattoo session", startLocal: "2030-01-07T10:00", endLocal: "2030-01-07T11:00", status: "booked", internalNotes: "Private synthetic note", clientVisibleNotes: "Arrive on time", paymentEvidence: null, transitionReviewed: true, ...extra });
const run = async (input, uid = staff) => {
  if (input.action !== "policy" && !Object.hasOwn(input, "policyRevision")) input = { ...input, policyRevision: (await db.doc("schedulingConfig/policy").get()).data()?.revision ?? 0 };
  return mutateSchedule({ firestore: db, auth, uid, input });
};
const save = (value = appointment(), extra = {}) => run({ action: "save", requestId: request(), reviewed: true, appointment: value, ...extra });
const setPolicy = async change => { const current = (await db.doc("schedulingConfig/policy").get()).data(); const value = { ...policy(), ...current, ...change }; delete value.reviewedBy; delete value.reviewedAt; return run({ action: "policy", requestId: request(), reviewed: true, revision: current.revision, policy: value }); };
before(async () => {
  assert.equal(serverFirebaseEnvironment(process.env).mode, "emulator"); assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  app = initializeApp({ projectId: DEMO_PROJECT_ID }, "schedule-tests"); db = getFirestore(app); auth = getAuth(app);
  for (const uid of [staff, alice, bob]) await auth.createUser({ uid, email: `${uid}@example.test`, password: "Synthetic-only-123!" });
  browser = browserApp(firebaseEnvironment().config, "schedule-browser"); ba = browserAuth(browser); bd = browserDb(browser);
  connectAuthEmulator(ba, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(bd, "127.0.0.1", 8080);
});
beforeEach(async () => {
  assert.ok((await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" })).ok);
  await db.doc("systemControls/writeFence").set(OPEN_EMULATOR_FENCE);
  await db.doc(`adminUsers/${staff}`).set({ active: true });
  await db.doc("studioClients/walkin").set({ name: "Synthetic Walk In", status: "lead" });
  await db.doc("studioClients/other").set({ name: "Synthetic Other", status: "lead" });
  await db.doc("schedulingConfig/policy").set(policy());
});
after(async () => { await deleteBrowser(browser); await deleteApp(app); });
test("proposed policy has no business hours and requires explicit timezone approval", () => {
  const proposal = proposedPolicy(); assert.equal(proposal.enabled, false); assert.equal(proposal.timezone, "America/Edmonton"); assert.equal(proposal.timezoneApproved, false);
  assert.ok(Object.values(proposal.studioHours).every(a => a.length === 0));
  assert.throws(() => policyInput({ ...proposal, enabled: true }), /timezone_approval_required/);
  const unsafe = policy(); unsafe.types.tattoo_session.chair = false;
  assert.throws(() => policyInput(unsafe), /tattoo_requires_shared_chair/);
});
test("new appointments need no Auth account and commit deterministic reservations, private notes and audit", async () => {
  const users = (await auth.listUsers()).users.length;
  const result = await save(); const row = (await db.doc(`appointments/${result.id}`).get()).data();
  assert.equal(row.studioClientId, "walkin"); assert.equal(row.clientUid, null); assert.equal(row.durationMinutes, 60);
  assert.equal(row.internalNotes, "Private synthetic note"); assert.equal((await auth.listUsers()).users.length, users);
  assert.equal((await db.doc("scheduleReservations/chair_2030-01-07").get()).data().entries.length, 1);
  assert.equal((await db.collection(`appointments/${result.id}/scheduleAudit`).get()).size, 1);
  assert.equal((await db.doc(`portalRecords/appointments/records/${result.id}`).get()).exists, false);
});
test("simultaneous artists competing for one chair produce exactly one winner", async () => {
  const result = await Promise.allSettled([save(), save(appointment({ artistId: "autumn" }))]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  assert.match(result.find(r => r.status === "rejected").reason.message, /resource_conflict/);
  assert.equal((await db.collection("appointments").get()).size, 1);
});
test("chair-free consultations allow different artists but never the same artist concurrently", async () => {
  const types = policy().types; types.consultation.chair = false; await setPolicy({ types });
  await save(appointment({ appointmentType: "consultation" }));
  await save(appointment({ appointmentType: "consultation", artistId: "autumn" }));
  await assert.rejects(save(appointment({ appointmentType: "consultation" })), /resource_conflict/);
});
test("buffers prevent close adjacency while exact buffered boundaries remain available", async () => {
  await setPolicy({ beforeMinutes: 15, afterMinutes: 15 }); await save();
  await assert.rejects(save(appointment({ startLocal: "2030-01-07T11:15", endLocal: "2030-01-07T12:15" })), /resource_conflict/);
  await save(appointment({ startLocal: "2030-01-07T11:30", endLocal: "2030-01-07T12:30" }));
});
test("business hours and individual artist availability are server constraints", async () => {
  await assert.rejects(save(appointment({ startLocal: "2030-01-07T08:00", endLocal: "2030-01-07T09:00" })), /outside_studio_hours/);
  const artistHours = policy().artistHours; artistHours.autumn = Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, []])); await setPolicy({ artistHours });
  await assert.rejects(save(appointment({ artistId: "autumn" })), /artist_unavailable/);
});
for (const resource of ["studio", "chair", "ben"]) test(`${resource} blackout denies booking`, async () => {
  await setPolicy({ blackouts: [{ date: "2030-01-07", resource }] }); await assert.rejects(save(), /blackout_conflict/);
});
test("BUYOUT and configurable events reserve both artists", async () => {
  const types = policy().types; types.consultation.chair = false; await setPolicy({ types });
  await save(appointment({ appointmentType: "buyout" }));
  await assert.rejects(save(appointment({ appointmentType: "consultation", artistId: "autumn" })), /resource_conflict/);
});
test("availability blocks can reserve studio resources without a client", async () => {
  await save(appointment({ studioClientId: null, appointmentType: "availability_block" }));
  await assert.rejects(save(appointment({ artistId: "autumn" })), /resource_conflict/);
});
test("rescheduling atomically releases old resources, keeps ID/createdAt and rejects stale edits", async () => {
  const result = await save(), original = (await db.doc(`appointments/${result.id}`).get()).data();
  const moved = appointment({ artistId: "autumn", startLocal: "2030-01-07T12:00", endLocal: "2030-01-07T13:00" });
  const next = await save(moved, { id: result.id, revision: 1 }); assert.equal(next.id, result.id); assert.equal(next.revision, 2);
  assert.equal((await db.doc(`appointments/${result.id}`).get()).data().createdAt.toMillis(), original.createdAt.toMillis());
  await save(); await assert.rejects(save(moved, { id: result.id, revision: 1 }), /stale_appointment/);
  assert.equal((await db.doc("scheduleReservations/ben_2030-01-07").get()).data().entries.length, 1);
});
test("failed reschedule leaves original reservation intact", async () => {
  const first = await save(); await save(appointment({ startLocal: "2030-01-07T12:00", endLocal: "2030-01-07T13:00" }));
  await assert.rejects(save(appointment({ startLocal: "2030-01-07T12:00", endLocal: "2030-01-07T13:00" }), { id: first.id, revision: 1 }), /resource_conflict/);
  assert.equal((await db.doc(`appointments/${first.id}`).get()).data().startAt.toMillis(), localInstant("2030-01-07T10:00", "America/Edmonton"));
});
test("cancellation releases chair and artist without deleting appointment or financial data", async () => {
  const row = await save(); await save(appointment({ status: "cancelled" }), { id: row.id, revision: 1 });
  await save(appointment({ artistId: "autumn" })); assert.equal((await db.doc(`appointments/${row.id}`).get()).data().status, "cancelled");
  assert.equal((await db.collection("paymentTransactions").get()).size, 0);
});
test("completed/no-show history is recorded but future terminal statuses are rejected", async () => {
  await save(appointment({ startLocal: "2020-01-07T10:00", endLocal: "2020-01-07T11:00", status: "completed" }));
  await save(appointment({ startLocal: "2020-01-07T12:00", endLocal: "2020-01-07T13:00", status: "no_show" }));
  for (const status of ["completed", "no_show"]) await assert.rejects(save(appointment({ status })), /future_terminal_status/);
});
test("identical concurrent/reloaded retries create one appointment and audit; changed body conflicts", async () => {
  const input = { action: "save", requestId: request(), reviewed: true, appointment: appointment() };
  const rows = await Promise.all([run(input), run(input)]); assert.equal(rows[0].id, rows[1].id);
  assert.deepEqual(await run(input), rows[0]);
  assert.equal((await db.collection(`appointments/${rows[0].id}/scheduleAudit`).get()).size, 1);
  await assert.rejects(run({ ...input, appointment: appointment({ title: "Changed" }) }), /request_conflict/);
});
test("DST gaps/repeated times, reversed and cross-day appointments fail closed", async () => {
  for (const local of ["2030-03-10T02:30", "2030-11-03T01:30"]) assert.throws(() => localInstant(local, "America/Edmonton"), /ambiguous_or_nonexistent/);
  await assert.rejects(save(appointment({ endLocal: "2030-01-07T09:00" })), /invalid_interval/);
  await assert.rejects(save(appointment({ endLocal: "2030-01-08T01:00" })), /cross_day/);
});
test("timezone changes with active reservations and stale policy updates are denied", async () => {
  await save(); await assert.rejects(setPolicy({ timezone: "America/Vancouver" }), /timezone_change_requires/);
  await setPolicy({ enabled: false });
  await assert.rejects(run({ action: "policy", requestId: request(), reviewed: true, revision: 0, policy: policy() }), /stale_policy/);
  await assert.rejects(save(appointment({ startLocal: "2030-01-07T13:00", endLocal: "2030-01-07T14:00" })), /scheduling_disabled/);
});
async function verified() {
  const account = await auth.getUser(alice);
  await db.doc("studioVerifiedAccountLinks/walkin").set({ state: "verified", studioClientId: "walkin", clientUid: alice, reviewedBy: staff, reviewedAt: Timestamp.now(), accountCreatedAt: account.metadata.creationTime });
}
test("optional UID/project requires independent evidence and cannot change during rescheduling", async () => {
  await assert.rejects(save(appointment({ clientUid: alice })), /verified_account_link_required/);
  await verified(); const project = { clientUid: alice, projectName: "Synthetic project" };
  await db.doc("projects/project").set(project);
  await db.doc("studioProjectAssociations/project").set({ state: "approved", studioClientId: "walkin", projectId: "project", reviewedBy: staff, reviewedAt: Timestamp.now(), projectFingerprint: fingerprint(project) });
  const result = await save(appointment({ clientUid: alice, projectId: "project" }));
  await assert.rejects(save(appointment({ studioClientId: "other", clientUid: alice, projectId: "project" }), { id: result.id, revision: 1 }), /identity_change/);
});
test("manual evidence is never Square-confirmed; cross-client payment selection is denied", async () => {
  await db.doc("studioPayments/manual").set({ origin: "manual", studioClientId: "walkin", projectId: null, amountCents: 1000, currency: "CAD", status: "recorded", providerConfirmed: false });
  await save(appointment({ paymentEvidence: { kind: "manual", id: "manual" } }));
  await assert.rejects(save(appointment({ studioClientId: "other", paymentEvidence: { kind: "manual", id: "manual" }, startLocal: "2030-01-07T12:00", endLocal: "2030-01-07T13:00" })), /payment_evidence_mismatch/);
  await assert.rejects(save(appointment({ paymentEvidence: { kind: "square", id: "manual" } })), /payment_evidence_mismatch/);
  const report = await scheduleReport(db, staff, new URLSearchParams({ studioClientId: "walkin" })); assert.equal(report.financial.manual[0].type, "manual_record"); assert.equal(report.financial.square.length, 0);
});
test("confirmed Square evidence and refund/dispute history are read-only and remain unchanged", async () => {
  for (const [id, type] of [["charge", "charge"], ["refund", "refund"], ["dispute", "chargeback"]]) await db.doc(`paymentTransactions/${id}`).set({ provider: "square", purpose: "tattoo_payment", studioClientId: "walkin", projectId: null, amountCents: 1000, currency: "CAD", type, status: "completed" });
  const before = fingerprint((await db.doc("paymentTransactions/charge").get()).data());
  await save(appointment({ paymentEvidence: { kind: "square", id: "charge" } }));
  const report = await scheduleReport(db, staff, new URLSearchParams({ studioClientId: "walkin" })); assert.equal(report.financial.square.length, 3);
  assert.equal(fingerprint((await db.doc("paymentTransactions/charge").get()).data()), before);
  assert.equal((await db.collection("creditLedger").get()).size, 0);
});
test("unreviewed legacy appointments block new booking; explicit adoption preserves IDs, baseline and timestamps", async () => {
  const old = { title: "Synthetic legacy", startAt: Timestamp.fromMillis(localInstant("2030-01-07T12:00", "America/Edmonton")), endAt: Timestamp.fromMillis(localInstant("2030-01-07T13:00", "America/Edmonton")), createdAt: new Timestamp(100, 42000), updatedAt: new Timestamp(200, 73000), internalNotes: "Legacy private", originalRelationship: "preserved" };
  await db.doc("appointments/legacy").set(old);
  await assert.rejects(save(), /unreviewed_legacy/);
  await assert.rejects(setPolicy({ transitionReviewed: true }), /unreviewed_legacy/);
  const input = { action: "adopt", id: "legacy", reviewed: true, requestId: request(), legacyFingerprint: fingerprint(old), appointment: appointment({ startLocal: "2030-01-07T12:00", endLocal: "2030-01-07T13:00" }) };
  await run(input);
  const current = (await db.doc("appointments/legacy").get()).data(); assert.equal(current.createdAt.nanoseconds, 42000); assert.equal(current.originalRelationship, "preserved");
  assert.equal(fingerprint((await db.doc("scheduleLegacySnapshots/legacy").get()).data().original), fingerprint(old));
  await save();
});
test("changed legacy source or original owner/project relationships stop adoption", async () => {
  const old = { title: "Synthetic legacy", clientUid: alice, projectId: "original-project" }; await db.doc("appointments/legacy").set(old);
  const input = { action: "adopt", id: "legacy", requestId: request(), reviewed: true, legacyFingerprint: fingerprint(old), appointment: appointment() };
  await assert.rejects(run(input), /legacy_relationship/);
  await db.doc("appointments/legacy").update({ title: "Changed" }); await assert.rejects(run(input), /legacy_record_changed/);
});
test("transition staging requires manual business-entry review; no calendar import occurs", async () => {
  await setPolicy({ transitionReviewed: false });
  await assert.rejects(save(appointment({ transitionReviewed: false })), /business_calendar_transition/);
  await save();
  assert.equal((await db.collection("appointments").get()).size, 1);
});
test("missing policy, missing fence and maintenance reject writes but authenticated safe reads remain", async () => {
  await db.doc("schedulingConfig/policy").delete(); await assert.rejects(save(), /reviewed_scheduling_policy/);
  await db.doc("schedulingConfig/policy").set(policy()); await db.doc("systemControls/writeFence").delete();
  await assert.rejects(save(), { code: "maintenance" });
  assert.equal((await scheduleReport(db, staff)).entries.length, 0);
});
test("clients, anonymous users and revoked admins cannot use scheduling APIs", async () => {
  for (const uid of [alice, bob]) {
    await assert.rejects(run({ action: "save", requestId: request(), reviewed: true, appointment: appointment() }, uid), /access_denied/);
    await assert.rejects(scheduleReport(db, uid), /access_denied/);
  }
  const response = await handleScheduleRequest(new Request("http://localhost/api/admin/schedule"), { firestore: db, authenticate: async () => { throw new Error("anonymous"); } }); assert.equal(response.status, 403);
  await db.doc(`adminUsers/${staff}`).set({ active: false }); await assert.rejects(save(), /access_denied/);
});
test("direct browser SDK writes cannot bypass scheduler, even active admins; private locks/audit remain unreadable", async () => {
  const result = await save();
  for (const uid of [staff, alice]) {
    await signInWithEmailAndPassword(ba, `${uid}@example.test`, "Synthetic-only-123!");
    await assert.rejects(setDoc(doc(bd, "appointments/forged"), { studioClientId: "walkin", title: "Forged" }), { code: "permission-denied" });
    await assert.rejects(updateDoc(doc(bd, `appointments/${result.id}`), { status: "cancelled" }), { code: "permission-denied" });
    for (const path of ["schedulingConfig/policy", "scheduleReservations/chair_2030-01-07", "schedulingControls/lock"]) await assert.rejects(getDocFromServer(doc(bd, path)), { code: "permission-denied" });
    if (uid === alice) await assert.rejects(getDocFromServer(doc(bd, `appointments/${result.id}`)), { code: "permission-denied" });
  }
});
test("exact reviewed publication excludes notes/payment evidence; rescheduling withdraws stale portal details", async () => {
  await verified(); const result = await save(appointment({ clientUid: alice }));
  const review = await reviewPublication(db, auth, staff, { path: `appointments/${result.id}` });
  assert.equal(review.candidate.internalNotes, undefined); assert.equal(review.candidate.paymentEvidence, undefined);
  await reviewPublication(db, auth, staff, { path: `appointments/${result.id}`, sourceHash: review.sourceHash, fields: Object.keys(review.candidate), reviewed: true }, true);
  await signInWithEmailAndPassword(ba, `${alice}@example.test`, "Synthetic-only-123!");
  const viewRef = doc(bd, `portalRecords/appointments/records/${result.id}`); assert.equal((await getDocFromServer(viewRef)).exists(), true);
  await save(appointment({ clientUid: alice, startLocal: "2030-01-07T12:00", endLocal: "2030-01-07T13:00" }), { id: result.id, revision: 1 });
  await assert.rejects(getDocFromServer(viewRef), { code: "permission-denied" });
  assert.equal((await db.doc(`portalRecords/appointments/records/${result.id}`).get()).exists, false);
  assert.equal((await db.doc(`publicationRecords/appointments/records/${result.id}`).get()).data().state, "withheld");
});
test("stale policy cannot reinterpret local times or resources after policy changes", async () => {
  await setPolicy({ timezone: "America/Vancouver" });
  await assert.rejects(run({ action: "save", requestId: request(), reviewed: true, policyRevision: 0, appointment: appointment() }), /stale_scheduling_policy/);
  assert.equal((await db.collection("appointments").get()).size, 0);
});
test("concurrent reschedule and competing booking cannot both acquire the same new slot", async () => {
  const original = await save();
  const moved = appointment({ startLocal: "2030-01-07T14:00", endLocal: "2030-01-07T15:00" });
  const result = await Promise.allSettled([save(moved, { id: original.id, revision: 1 }), save({ ...moved, artistId: "autumn" })]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  const slot = (await db.doc("scheduleReservations/chair_2030-01-07").get()).data().entries.filter(r => r.start === localInstant(moved.startLocal, "America/Edmonton"));
  assert.equal(slot.length, 1);
});
test("cached admin REST writes are denied by the deployed emulator rules", async () => {
  await signInWithEmailAndPassword(ba, `${staff}@example.test`, "Synthetic-only-123!");
  const response = await fetch(`http://127.0.0.1:8080/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents/appointments?documentId=rest-forged`, { method: "POST", headers: { Authorization: `Bearer ${await ba.currentUser.getIdToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { title: { stringValue: "Forged REST appointment" } } }) });
  assert.equal(response.status, 403);
});
test("read API validates calendar ranges and preserves safe reads without granting mutation access", async () => {
  for (const params of [{ from: "2030-02-31", to: "2030-03-05" }, { from: "2030-01-01", to: "2031-01-01" }]) await assert.rejects(scheduleReport(db, staff, new URLSearchParams(params)), /invalid_calendar_range/);
  const dependencies = { firestore: db, auth, authenticate: async () => staff };
  const response = await handleScheduleRequest(new Request("http://localhost/api/admin/schedule?from=2030-01-01&to=2030-01-31"), dependencies);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const bad = await handleScheduleRequest(new Request("http://localhost/api/admin/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", requestId: request(), reviewed: true, policyRevision: 0, appointment: { ...appointment(), chargeDeposit: true } }) }), dependencies);
  assert.equal(bad.status, 400); assert.equal((await db.collection("appointments").get()).size, 0);
});
test("safe cancellation remains possible after a client is archived without reinterpreting old evidence", async () => {
  const result = await save();
  await db.doc("studioClients/walkin").update({ status: "archived" });
  await assert.rejects(save(appointment({ startLocal: "2030-01-07T12:00", endLocal: "2030-01-07T13:00" }), { id: result.id, revision: 1 }), /studio_client_unavailable/);
  await save(appointment({ status: "cancelled" }), { id: result.id, revision: 1 });
  assert.equal((await db.doc(`appointments/${result.id}`).get()).data().status, "cancelled");
  assert.deepEqual((await db.doc("scheduleReservations/chair_2030-01-07").get()).data().entries, []);
});
