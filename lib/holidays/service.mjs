import reference from "../../data/holiday-reference.json" with { type: "json" };
import { fail, recordId } from "../clients/clientModel.mjs";
import { fingerprint } from "../migration/model.mjs";
import { localInstant, localStamp, blocking, overlaps } from "../scheduling/model.mjs";
export const holidayReference = reference;
const byId = new Map(reference.records.map(r => [r.id, r]));
export async function readHolidayControls(reader, db) {
  const rows = await reader(db.collection("schedulingHolidayPolicies").limit(301));
  if (rows.size > 300) fail("holiday_policy_inventory_limit", 409);
  return rows.docs.map(row => ({ ...row.data(), id: row.id }));
}
function validControl(control) {
  if (!["reminder", "review", "closed"].includes(control.state) || !Number.isInteger(control.revision) || control.revision < 1) fail("invalid_holiday_policy", 409);
  if (control.state !== "reminder" && (!Number.isFinite(control.start) || !Number.isFinite(control.end) || control.end <= control.start || !["studio", "chair", "ben", "autumn"].includes(control.resource))) fail("invalid_holiday_policy", 409);
}
export function evaluateHolidays(value, controls, policyRevision) {
  const notices = [], applicable = [];
  for (const control of controls) {
    validControl(control);
    const item = byId.get(control.id);
    if (control.state !== "reminder" && (!item || control.sourceHash !== fingerprint(item))) fail("holiday_reference_changed_review_required", 409);
  }
  for (const item of reference.records) {
    const control = controls.find(c => c.id === item.id), state = control?.state || "reminder";
    const interval = state === "reminder" ? { start: item.start, end: item.end } : control;
    if (!overlaps(interval, { start: value.occupiedStart, end: value.occupiedEnd }) || (state !== "reminder" && control.resource !== "studio" && !value.resources.includes(control.resource))) continue;
    notices.push({ id: item.id, name: item.name, category: item.category, state, start: interval.start, end: interval.end });
    if (state !== "reminder") applicable.push({ id: item.id, revision: control.revision, state, sourceHash: control.sourceHash, start: interval.start, end: interval.end, resource: control.resource });
  }
  const coverageAvailable = value.day >= `${reference.firstYear}-01-01` && value.day <= `${reference.lastYear}-12-31`;
  const token = fingerprint({ version: reference.version, applicable, interval: [value.occupiedStart, value.occupiedEnd], resources: value.resources, policyRevision });
  return { notices, coverageAvailable, token, requiresReview: notices.some(n => n.state === "review"), blocked: notices.some(n => n.state === "closed") };
}
export function assertHolidayBooking(value, controls, policyRevision, input) {
  if (!blocking(value.status)) return null;
  const result = evaluateHolidays(value, controls, policyRevision);
  if (result.blocked) fail("holiday_closure_conflict", 409);
  if (result.requiresReview && (input.holidayReviewed !== true || input.holidayReviewToken !== result.token)) fail("holiday_review_required", 409);
  return { referenceVersion: reference.version, token: result.token, reviewedIds: result.notices.filter(n => n.state === "review").map(n => n.id) };
}
export async function prepareHolidayPolicy(tx, db, input, policy, rows) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["id", "revision", "sourceHash", "state", "resource", "startLocal", "endLocal", "closureApproved"].includes(k))) fail("invalid_holiday_policy");
  const item = byId.get(recordId(input.id));
  if (!item || input.sourceHash !== fingerprint(item)) fail("holiday_reference_changed_review_required", 409);
  if (policy.timezone !== reference.timezone || !policy.timezoneApproved) fail("holiday_policy_requires_approved_edmonton_timezone", 409);
  const ref = db.doc(`schedulingHolidayPolicies/${item.id}`), previous = await tx.get(ref);
  if (!Number.isInteger(input.revision) || input.revision !== (previous.data()?.revision || 0)) fail("stale_holiday_policy", 409);
  if (!["reminder", "review", "closed"].includes(input.state)) fail("invalid_holiday_policy");
  let start = null, end = null, resource = "studio";
  if (input.state !== "reminder") {
    if (!["studio", "chair", "ben", "autumn"].includes(input.resource)) fail("invalid_holiday_resource");
    resource = input.resource; start = localInstant(input.startLocal, reference.timezone); end = localInstant(input.endLocal, reference.timezone);
    if (end <= start || start < item.start - 86400000 || end > item.end + 86400000) fail("holiday_interval_outside_reviewed_reference", 409);
  }
  if (input.state === "closed") {
    if (input.closureApproved !== true) fail("explicit_closure_approval_required", 409);
    if (rows.some(row => row.data().schedulingProtocol !== 1)) fail("unreviewed_legacy_appointments", 409);
    const conflicts = rows.filter(row => { const a = row.data(); return blocking(a.status) && (resource === "studio" || a.resources.includes(resource)) && overlaps({ start, end }, { start: a.occupiedStart, end: a.occupiedEnd }); });
    if (conflicts.length) fail("holiday_closure_has_existing_bookings", 409, { conflictingAppointmentIds: conflicts.slice(0, 20).map(r => r.id) });
  }
  return { ref, previous: previous.data() || null, data: { state: input.state, revision: input.revision + 1, sourceHash: input.sourceHash, referenceVersion: reference.version, resource, start, end } };
}
export function holidayReport(controls, from, to) {
  const records = reference.records.map(item => {
    const control = controls.find(c => c.id === item.id), state = control?.state || "reminder";
    return { ...item, sourceHash: fingerprint(item), state, revision: control?.revision || 0, policyStale: !!control && control.sourceHash !== fingerprint(item), resource: control?.resource || "studio",
      controlStart: control?.start ?? null, controlEnd: control?.end ?? null,
      closureStartDate: control?.start ? localStamp(control.start, reference.timezone).slice(0, 10) : null, closureEndDate: control?.end ? localStamp(control.end - 1, reference.timezone).slice(0, 10) : null };
  });
  const now = Date.now(), horizon = now + 366 * 86400000;
  return { version: reference.version, timezone: reference.timezone, firstYear: reference.firstYear, lastYear: reference.lastYear, sources: reference.sources, location: reference.location,
    coverageAvailable: from >= `${reference.firstYear}-01-01` && to <= `${reference.lastYear}-12-31`,
    calendar: records.filter(r => (r.startDate <= to && r.endDate >= from) || (r.state !== "reminder" && r.closureStartDate <= to && r.closureEndDate >= from)),
    upcoming: records.filter(r => r.end >= now && r.start <= horizon).slice(0, 60) };
}
