import {
  calendarDays, edmontonDateTime, edmontonWall, findChairConflicts,
  isSaturday, STUDIO_END_MINUTES, STUDIO_START_MINUTES, toMillis,
} from "./sharedChair.mjs";

export const SLOT_INTERVAL = 30;
export const TIMELINE_TOTAL_MINUTES = STUDIO_END_MINUTES - STUDIO_START_MINUTES;

export function clockLabel(time) {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 || 12;
  return hour + ":" + String(m).padStart(2, "0") + (h >= 12 ? " PM" : " AM");
}

export function calendarLabel(day, options = {}) {
  const date = new Date(day + "T12:00:00Z");
  if (!Number.isFinite(date.getTime())) return day;
  return date.toLocaleDateString("en-CA", { timeZone: "UTC", ...options });
}

// Time slots are suggestions only. All existing appointments, regardless of
// the visual artist filter, hold the one shared room unless cancelled.
export function slotsForDay(day, durationMinutes, appointments, now = Date.now()) {
  const duration = Number(durationMinutes);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(duration) ||
      duration < 15 || duration % 15 !== 0 || duration > TIMELINE_TOTAL_MINUTES) return [];
  if (isSaturday(day)) return [];
  const slots = [];
  for (let minute = STUDIO_START_MINUTES; minute + duration <= STUDIO_END_MINUTES; minute += SLOT_INTERVAL) {
    const time = String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
    const start = edmontonDateTime(day, time);
    if (!start) continue;
    const conflicts = findChairConflicts(appointments, start.getTime(), start.getTime() + duration * 60000);
    const past = start.getTime() <= now;
    slots.push({ day, time, label: clockLabel(time), available: !past && conflicts.length === 0,
      reason: past ? "Past time" : conflicts.length ? "Chair occupied" : "Available",
      conflicts: conflicts.length });
  }
  return slots;
}

// A view filter is display-only: never use filtered results when checking chair availability.
export function appointmentsForDay(appointments, day, artist = "all") {
  return appointments.filter((entry) =>
    edmontonWall(entry.startAt).slice(0, 10) === day &&
    (artist === "all" || entry.assignedInbox === artist)
  ).sort((a, b) => toMillis(a.startAt) - toMillis(b.startAt));
}

export function timelinePlacement(entry) {
  const start = edmontonWall(entry.startAt);
  const first = Number(start.slice(11,13)) * 60 + Number(start.slice(14,16));
  const startMs = toMillis(entry.startAt), endMs = toMillis(entry.endAt);
  if (!Number.isFinite(first) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const last = first + (endMs - startMs) / 60000;
  if (first >= STUDIO_END_MINUTES || last <= STUDIO_START_MINUTES) return null;
  const visibleStart = Math.max(first, STUDIO_START_MINUTES);
  const visibleEnd = Math.min(last, STUDIO_END_MINUTES);
  return {
    top: ((visibleStart - STUDIO_START_MINUTES) / TIMELINE_TOTAL_MINUTES) * 100,
    height: ((visibleEnd - visibleStart) / TIMELINE_TOTAL_MINUTES) * 100,
    clipped: first < STUDIO_START_MINUTES || last > STUDIO_END_MINUTES,
  };
}

export function countAppointmentsForDay(appointments, day) {
  return appointmentsForDay(appointments, day).filter(a => a.status !== "cancelled").length;
}

export function weekDaysFor(day) {
  return calendarDays(day, "week");
}
