import { fail, recordId, text } from "../clients/clientModel.mjs";
import { ARTISTS, TYPES, STATUSES, confirmedStudioHours } from "./constants.mjs";
export { ARTISTS, TYPES, STATUSES, confirmedStudioHours };
export const blocking = status => ["tentative", "booked", "confirmed"].includes(status);
const emptyWeek = () => Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, []]));
export function proposedPolicy() {
  return { schemaVersion: 1, revision: 0, enabled: false, timezone: "America/Edmonton", timezoneApproved: true, transitionReviewed: false,
    studioHours: confirmedStudioHours(), artistHours: { ben: emptyWeek(), autumn: emptyWeek() }, beforeMinutes: 0, afterMinutes: 0,
    types: Object.fromEntries(TYPES.map(type => [type, { chair: true, bothArtists: ["buyout", "studio_event"].includes(type) }])), blackouts: [] };
}
function only(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k))) fail("unsupported_field");
}
const minute = value => { if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail("invalid_hours"); return Number(value.slice(0, 2)) * 60 + Number(value.slice(3)); };
function week(value) {
  only(value, ["0", "1", "2", "3", "4", "5", "6"]);
  for (let d = 0; d < 7; d++) {
    if (!Array.isArray(value[d]) || value[d].length > 4) fail("invalid_hours");
    let end = -1;
    for (const pair of value[d]) {
      only(pair, ["start", "end"]);
      if (minute(pair.start) >= minute(pair.end) || minute(pair.start) < end) fail("invalid_hours");
      end = minute(pair.end);
    }
  }
}
export function policyInput(value) {
  only(value, Object.keys(proposedPolicy()));
  if (value.schemaVersion !== 1 || typeof value.enabled !== "boolean" || typeof value.timezoneApproved !== "boolean" || typeof value.transitionReviewed !== "boolean") fail("invalid_policy");
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(); } catch { fail("invalid_timezone"); }
  if (typeof value.timezone !== "string" || (value.enabled && !value.timezoneApproved)) fail("timezone_approval_required");
  week(value.studioHours); only(value.artistHours, ARTISTS); ARTISTS.forEach(a => week(value.artistHours[a]));
  for (const key of ["beforeMinutes", "afterMinutes"]) if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 180) fail("invalid_buffer");
  only(value.types, TYPES);
  for (const type of TYPES) {
    only(value.types[type], ["chair", "bothArtists"]);
    if (typeof value.types[type].chair !== "boolean" || typeof value.types[type].bothArtists !== "boolean") fail("invalid_resources");
    if (["tattoo_session", "touch_up", "tapout", "buyout"].includes(type) && !value.types[type].chair) fail("tattoo_requires_shared_chair");
  }
  if (!Array.isArray(value.blackouts) || value.blackouts.length > 500) fail("invalid_blackouts");
  for (const row of value.blackouts) {
    only(row, ["date", "resource"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date || !["studio", "chair", ...ARTISTS].includes(row.resource)) fail("invalid_blackout");
  }
  return value;
}
export function localStamp(ms, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function localInstant(value, timezone) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail("invalid_local_time");
  const base = Date.parse(`${value}Z`);
  if (!Number.isFinite(base)) fail("invalid_local_time");
  // Enumerate quarter-hour offsets, rejecting both nonexistent and repeated wall times.
  // Supported zones must have modern quarter-hour UTC offsets; no guessing at DST.
  const candidates = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = base + offset * 60000;
    if (localStamp(candidate, timezone) === value) candidates.push(candidate);
  }
  if (candidates.length !== 1) fail("ambiguous_or_nonexistent_local_time");
  return candidates[0];
}
export function appointmentInput(input, policy) {
  only(input, ["studioClientId", "clientUid", "projectId", "artistId", "appointmentType", "title", "startLocal", "endLocal", "status", "internalNotes", "clientVisibleNotes", "paymentEvidence", "transitionReviewed"]);
  if (!ARTISTS.includes(input.artistId) || !TYPES.includes(input.appointmentType) || !STATUSES.includes(input.status)) fail("invalid_appointment_selection");
  const needsClient = !["studio_event", "availability_block"].includes(input.appointmentType);
  const studioClientId = input.studioClientId ? recordId(input.studioClientId) : null;
  if (needsClient && !studioClientId) fail("studio_client_required");
  const clientUid = input.clientUid ? recordId(input.clientUid) : null, projectId = input.projectId ? recordId(input.projectId) : null;
  if (!studioClientId && (clientUid || projectId || input.paymentEvidence)) fail("client_association_required");
  const start = localInstant(input.startLocal, policy.timezone), end = localInstant(input.endLocal, policy.timezone);
  if (end <= start || end - start > 24 * 3600000) fail("invalid_interval");
  if ((input.status === "completed" && end > Date.now()) || (input.status === "no_show" && start > Date.now())) fail("future_terminal_status");
  const resources = [...(policy.types[input.appointmentType].bothArtists ? ARTISTS : [input.artistId]), ...(policy.types[input.appointmentType].chair ? ["chair"] : [])].sort();
  const occupiedStart = start - policy.beforeMinutes * 60000, occupiedEnd = end + policy.afterMinutes * 60000;
  const day = localStamp(occupiedStart, policy.timezone).slice(0, 10);
  if (blocking(input.status) && localStamp(occupiedEnd - 1, policy.timezone).slice(0, 10) !== day) fail("cross_day_booking_requires_split");
  return { studioClientId, clientUid, projectId, artistId: input.artistId, appointmentType: input.appointmentType,
    title: text(input.title, 160, true), status: input.status, internalNotes: text(input.internalNotes, 4000), clientVisibleNotes: text(input.clientVisibleNotes, 1000),
    start, end, resources, occupiedStart, occupiedEnd, day, timezone: policy.timezone,
    paymentEvidence: input.paymentEvidence || null, transitionReviewed: input.transitionReviewed === true };
}
export function assertAvailability(value, policy) {
  if (!blocking(value.status)) return;
  const day = new Date(`${value.day}T12:00:00Z`).getUTCDay();
  const start = minute(localStamp(value.occupiedStart, policy.timezone).slice(11)), end = minute(localStamp(value.occupiedEnd, policy.timezone).slice(11));
  const contains = windows => windows.some(window => minute(window.start) <= start && end <= minute(window.end));
  if (!contains(policy.studioHours[day])) fail("outside_studio_hours", 409);
  for (const artist of value.resources.filter(r => ARTISTS.includes(r))) if (!contains(policy.artistHours[artist][day])) fail("artist_unavailable", 409);
  if (policy.blackouts.some(b => b.date === value.day && (b.resource === "studio" || value.resources.includes(b.resource)))) fail("blackout_conflict", 409);
}
export const overlaps = (a, b) => a.start < b.end && b.start < a.end;
