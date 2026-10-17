// Studio booking helpers: one shared room/chair in Edmonton.
// These checks prevent ordinary manual mistakes but are NOT an atomic booking lock.
export const STUDIO_TIME_ZONE = "America/Edmonton";
export const STUDIO_START_MINUTES = 11 * 60;
export const STUDIO_END_MINUTES = 20 * 60;

const wallFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STUDIO_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function toMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return NaN;
}

export function edmontonWall(value) {
  const ms = typeof value === "number" ? value : toMillis(value);
  if (!Number.isFinite(ms)) return "";
  const parts = Object.fromEntries(wallFormatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return parts.year + "-" + parts.month + "-" + parts.day + "T" + parts.hour + ":" + parts.minute;
}

export function edmontonToday(now = Date.now()) {
  return edmontonWall(now).slice(0, 10);
}

export function addDays(isoDate, days) {
  const date = new Date(isoDate + "T12:00:00Z");
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function calendarDays(date, view) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const count = view === "day" ? 1 : view === "month" ? 42 : 7;
  let start = view === "month" ? date.slice(0, 7) + "-01" : date;
  if (view !== "day") {
    const weekday = new Date(start + "T12:00:00Z").getUTCDay();
    start = addDays(start, -weekday); // Sunday through Saturday.
  }
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function stepCalendarDate(date, view, direction) {
  if (view === "month") {
    const d = new Date(date.slice(0, 7) + "-01T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + direction);
    return d.toISOString().slice(0, 10);
  }
  return addDays(date, direction * (view === "day" ? 1 : 7));
}

export function isSaturday(isoDate) {
  return new Date(isoDate + "T12:00:00Z").getUTCDay() === 6;
}

// Alberta observes MST (UTC-7) / MDT (UTC-6). Confirm against Intl to
// reject nonexistent times at the DST transition rather than guessing.
export function edmontonDateTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const utcWall = Date.UTC(year, month - 1, day, hour, minute);
  const candidates = [6, 7].map((offset) => new Date(utcWall + offset * 3600000));
  return candidates.find((candidate) => edmontonWall(candidate) === date + "T" + time) || null;
}

export function isActiveChairAppointment(appointment) {
  return appointment.status !== "cancelled";
}

export function findChairConflicts(appointments, startMs, endMs, excludeId = null) {
  return appointments.filter((appointment) => {
    if (excludeId && appointment.id === excludeId) return false;
    if (!isActiveChairAppointment(appointment)) return false;
    const a = toMillis(appointment.startAt);
    const b = toMillis(appointment.endAt);
    return Number.isFinite(a) && Number.isFinite(b) && a < endMs && b > startMs;
  });
}

export function validateChairSlot({ date, time, durationMinutes, appointments = [] }) {
  const duration = Number(durationMinutes);
  const start = edmontonDateTime(date, time);
  if (!start || !Number.isInteger(duration) || duration < 15 || duration % 15 !== 0) {
    return { ok: false, message: "Choose a valid Edmonton date, time and duration in 15-minute increments." };
  }
  if (isSaturday(date)) return { ok: false, message: "The studio is closed Saturdays. Choose Sunday through Friday." };
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  const startMinutes = hour * 60 + minute;
  if (startMinutes < STUDIO_START_MINUTES || startMinutes + duration > STUDIO_END_MINUTES) {
    return { ok: false, message: "Appointments must fit within studio hours, 11 AM–8 PM Edmonton time." };
  }
  const end = new Date(start.getTime() + duration * 60000);
  const conflicts = findChairConflicts(appointments, start.getTime(), end.getTime());
  if (conflicts.length) {
    return { ok: false, message: "This time overlaps an existing studio appointment. Ben and Autumn share one room/chair.", conflicts };
  }
  return { ok: true, start, end };
}
