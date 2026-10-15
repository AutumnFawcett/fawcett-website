import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { serverFirebaseEnvironment, DEMO_PROJECT_ID } from "../../lib/firebaseEnvironment.mjs";
import { OPEN_EMULATOR_FENCE } from "../../lib/safety/writeFence.mjs";
import { proposedPolicy, localStamp } from "../../lib/scheduling/model.mjs";
import { mutateSchedule, scheduleReport, handleScheduleRequest } from "../../lib/scheduling/service.mjs";
import { holidayReference } from "../../lib/holidays/service.mjs";
import { fingerprint } from "../../lib/migration/model.mjs";
let app, db, auth, sequence = 0;
const staff = "holiday-admin", client = "holiday-client";
const pesach = holidayReference.records.find(r => r.id === "jewish-pesach-5786");
const yom = holidayReference.records.find(r => r.id === "jewish-yom-kippur-5787");
const request = () => `synthetic-holiday-${++sequence}`;
const run = (input, uid = staff) => mutateSchedule({ firestore: db, auth, uid, input: { reviewed: true, requestId: request(), ...input } });
const appointment = extra => ({ studioClientId: "holiday-studio", clientUid: null, projectId: null, artistId: "ben", appointmentType: "tattoo_session", title: "Synthetic holiday appointment", startLocal: "2026-04-02T12:00", endLocal: "2026-04-02T13:00", status: "booked", internalNotes: "Synthetic private note", clientVisibleNotes: "", paymentEvidence: null, transitionReviewed: true, ...extra });
const book = (extra = {}, approval = {}) => run({ action: "save", policyRevision: 0, appointment: appointment(extra), ...approval });
async function setting(state, extra = {}, item = pesach) {
  const current = await db.doc(`schedulingHolidayPolicies/${item.id}`).get();
  return run({ action: "holiday", holiday: { id: item.id, revision: current.data()?.revision || 0, sourceHash: fingerprint(item), state, resource: "studio", startLocal: "2026-04-02T15:00", endLocal: "2026-04-02T17:00", closureApproved: state === "closed", ...extra } });
}
async function preview(value) {
  return (await scheduleReport(db, staff, new URLSearchParams({ from: value.startLocal.slice(0, 10), to: value.endLocal.slice(0, 10), bookingStart: value.startLocal, bookingEnd: value.endLocal, artistId: value.artistId, appointmentType: value.appointmentType }))).holidayPreview;
}
before(async () => {
  assert.equal(serverFirebaseEnvironment(process.env).mode, "emulator"); assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  app = initializeApp({ projectId: DEMO_PROJECT_ID }, "holiday-test"); db = getFirestore(app); auth = getAuth(app);
  for (const uid of [staff, client]) await auth.createUser({ uid, email: `${uid}@example.test`, password: "Synthetic-only-123!" });
});
beforeEach(async () => {
  assert.ok((await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${DEMO_PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" })).ok);
  await db.doc("systemControls/writeFence").set(OPEN_EMULATOR_FENCE); await db.doc(`adminUsers/${staff}`).set({ active: true });
  await db.doc("studioClients/holiday-studio").set({ name: "Synthetic Holiday Client", status: "lead" });
  // Fictional all-week extended hours solely to exercise evening/DST edge cases.
  const hours = Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, [{ start: "09:00", end: "21:00" }]]));
  await db.doc("schedulingConfig/policy").set({ ...proposedPolicy(), enabled: true, transitionReviewed: true, studioHours: hours, artistHours: { ben: hours, autumn: hours } });
});
after(async () => { await deleteApp(app); });
test("default holiday references remind without creating a closure or rejecting a manual booking", async () => {
  const p = await preview(appointment()); assert.equal(p.requiresReview, false); assert.equal(p.blocked, false); assert.ok(p.notices.some(n => n.id === pesach.id));
  await book(); assert.equal((await db.collection("schedulingHolidayPolicies").get()).size, 0);
});
test("review-before-booking requires an exact acknowledgement token and stores only reviewed IDs", async () => {
  await setting("review", { startLocal: "2026-04-02T11:00", endLocal: "2026-04-02T20:00" });
  const p = await preview(appointment()); assert.equal(p.requiresReview, true);
  await assert.rejects(book(), /holiday_review_required/);
  await assert.rejects(book({}, { holidayReviewed: true, holidayReviewToken: "forged" }), /holiday_review_required/);
  const result = await book({}, { holidayReviewed: true, holidayReviewToken: p.token });
  assert.deepEqual((await db.doc(`appointments/${result.id}`).get()).data().holidayReview.reviewedIds, [pesach.id]);
});
test("review tokens cannot authorize a changed holiday policy or appointment time", async () => {
  await setting("review", { startLocal: "2026-04-02T11:00", endLocal: "2026-04-02T20:00" });
  const p = await preview(appointment());
  await setting("review", { startLocal: "2026-04-02T11:00", endLocal: "2026-04-02T20:00" });
  await assert.rejects(book({}, { holidayReviewed: true, holidayReviewToken: p.token }), /holiday_review_required/);
  const p2 = await preview(appointment());
  await assert.rejects(book({ endLocal: "2026-04-02T14:00" }, { holidayReviewed: true, holidayReviewToken: p2.token }), /holiday_review_required/);
});
test("Jewish review includes the preceding Edmonton evening but not its morning", async () => {
  const startLocal = localStamp(yom.start, "America/Edmonton"), endLocal = localStamp(Math.ceil(yom.end / 60000) * 60000, "America/Edmonton");
  await setting("review", { startLocal, endLocal }, yom);
  const morning = appointment({ startLocal: "2026-09-20T11:00", endLocal: "2026-09-20T12:00" });
  assert.equal((await preview(morning)).requiresReview, false);
  const evening = appointment({ startLocal: "2026-09-20T19:00", endLocal: "2026-09-20T20:00" });
  const p = await preview(evening); assert.equal(p.requiresReview, true); assert.ok(p.notices.some(n => n.id === yom.id));
  await assert.rejects(book({ startLocal: evening.startLocal, endLocal: evening.endLocal }), /holiday_review_required/);
});
test("explicit partial-day closure blocks only its interval and cannot be overridden by acknowledgement", async () => {
  await setting("closed");
  await book({ startLocal: "2026-04-02T14:00", endLocal: "2026-04-02T15:00" });
  await assert.rejects(book({ startLocal: "2026-04-02T15:00", endLocal: "2026-04-02T16:00" }, { holidayReviewed: true, holidayReviewToken: "anything" }), /holiday_closure_conflict/);
  await book({ startLocal: "2026-04-02T17:00", endLocal: "2026-04-02T18:00" });
});
test("buffers count toward closure overlap and resources remain distinct", async () => {
  await setting("closed", { resource: "autumn" });
  await book({ startLocal: "2026-04-02T15:00", endLocal: "2026-04-02T16:00" });
  await assert.rejects(book({ artistId: "autumn", startLocal: "2026-04-02T16:00", endLocal: "2026-04-02T17:00" }), /holiday_closure_conflict/);
  await db.doc("schedulingConfig/policy").update({ beforeMinutes: 15 });
  await assert.rejects(book({ artistId: "autumn", startLocal: "2026-04-02T17:00", endLocal: "2026-04-02T18:00" }), /holiday_closure_conflict/);
});
test("closure approval rejects existing bookings instead of moving or canceling them", async () => {
  const a = await book({ startLocal: "2026-04-02T15:00", endLocal: "2026-04-02T16:00" });
  await assert.rejects(setting("closed"), /holiday_closure_has_existing_bookings/);
  assert.equal((await db.doc(`appointments/${a.id}`).get()).data().status, "booked");
  assert.equal((await db.doc(`schedulingHolidayPolicies/${pesach.id}`).get()).exists, false);
});
test("simultaneous closure approval and booking cannot both commit", async () => {
  const result = await Promise.allSettled([setting("closed"), book({ startLocal: "2026-04-02T15:00", endLocal: "2026-04-02T16:00" })]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
});
test("reminder reset withdraws an approved closure through a reviewed audited revision", async () => {
  await setting("closed"); await setting("reminder"); await book({ startLocal: "2026-04-02T15:00", endLocal: "2026-04-02T16:00" });
  const current = (await db.doc(`schedulingHolidayPolicies/${pesach.id}`).get()).data(); assert.equal(current.state, "reminder"); assert.equal(current.start, null);
  assert.equal((await db.collection(`schedulingHolidayPolicies/${pesach.id}/audit`).get()).size, 2);
});
test("source changes, unsupported resources, forged closures and unrelated dates fail closed", async () => {
  await assert.rejects(setting("closed", { closureApproved: false }), /explicit_closure/);
  await assert.rejects(setting("closed", { sourceHash: "wrong" }), /holiday_reference_changed/);
  await assert.rejects(setting("closed", { resource: "chair-two" }), /invalid_holiday_resource/);
  await assert.rejects(setting("closed", { startLocal: "2026-07-01T12:00", endLocal: "2026-07-01T14:00" }), /holiday_interval_outside/);
  await setting("review"); await db.doc(`schedulingHolidayPolicies/${pesach.id}`).update({ sourceHash: "stale" });
  await assert.rejects(book(), /holiday_reference_changed/);
});
test("stale control revisions, invalid DST boundaries and unreviewed legacy appointments cannot approve closures", async () => {
  await setting("review"); await assert.rejects(setting("closed", { revision: 0 }), /stale_holiday_policy/);
  const purim = holidayReference.records.find(r => r.id === "jewish-purim-5786");
  await assert.rejects(setting("closed", { startLocal: "2026-03-08T02:30", endLocal: "2026-03-08T04:00" }, purim), /ambiguous_or_nonexistent/);
  await db.doc("appointments/unknown-legacy").set({ title: "Synthetic unknown" }); await assert.rejects(setting("closed"), /unreviewed_legacy/);
});
test("maintenance and non-admin users cannot change holiday controls", async () => {
  const input = { action: "holiday", holiday: { id: pesach.id, revision: 0, sourceHash: fingerprint(pesach), state: "reminder" } };
  await assert.rejects(run(input, client), /access_denied/);
  await db.doc("systemControls/writeFence").delete(); await assert.rejects(run(input), { code: "maintenance" });
  const response = await handleScheduleRequest(new Request("http://localhost/api/admin/schedule"), { firestore: db, authenticate: async () => { throw new Error("anonymous"); } }); assert.equal(response.status, 403);
});
test("coverage gaps are visible and active holiday controls prevent a timezone reinterpretation", async () => {
  const unknown = await scheduleReport(db, staff, new URLSearchParams({ from: "2033-01-01", to: "2033-01-20" })); assert.equal(unknown.holidays.coverageAvailable, false);
  await setting("review"); const policy = (await db.doc("schedulingConfig/policy").get()).data();
  await assert.rejects(run({ action: "policy", revision: 0, policy: { ...policy, timezone: "America/Vancouver" } }), /holiday_policy_timezone_conflict/);
});
