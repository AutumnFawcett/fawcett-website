import test from "node:test";
import assert from "node:assert/strict";
import {
  edmontonDateTime, edmontonWall, edmontonToday, calendarDays, stepCalendarDate,
  validateChairSlot, findChairConflicts,
} from "../../lib/scheduling/sharedChair.mjs";

test("Edmonton wall time handles standard and daylight saving time", () => {
  assert.equal(edmontonDateTime("2026-01-10", "11:00")?.toISOString(), "2026-01-10T18:00:00.000Z");
  assert.equal(edmontonDateTime("2026-07-12", "11:00")?.toISOString(), "2026-07-12T17:00:00.000Z");
  assert.equal(edmontonWall(edmontonDateTime("2026-07-12", "11:00")), "2026-07-12T11:00");
  assert.equal(edmontonToday(Date.parse("2026-07-12T03:00:00Z")), "2026-07-11");
  assert.equal(edmontonDateTime("2026-03-08", "02:30"), null);
});
test("day week month navigation uses Sunday-first weeks", () => {
  assert.deepEqual(calendarDays("2026-10-17", "day"), ["2026-10-17"]);
  assert.deepEqual(calendarDays("2026-10-17", "week"), [
    "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"
  ]);
  assert.equal(calendarDays("2026-10-17", "month").length, 42);
  assert.equal(stepCalendarDate("2026-12-15", "month", 1), "2027-01-01");
  assert.equal(stepCalendarDate("2026-10-17", "week", -1), "2026-10-10");
});
test("one chair blocks overlapping times across either artist, but not adjacent times", () => {
  const first = edmontonDateTime("2026-10-18", "12:00");
  const appointment = {
    id: "booked-by-ben", assignedInbox: "ben", status: "booked",
    startAt: first, endAt: new Date(first.getTime() + 90 * 60000),
  };
  const overlapping = validateChairSlot({ date: "2026-10-18", time: "12:30", durationMinutes: 60, appointments: [appointment] });
  assert.equal(overlapping.ok, false);
  assert.equal(overlapping.conflicts[0].id, "booked-by-ben");
  assert.equal(validateChairSlot({ date: "2026-10-18", time: "13:30", durationMinutes: 60, appointments: [appointment] }).ok, true);
  assert.equal(findChairConflicts([{ ...appointment, status: "cancelled" }], first.getTime(), first.getTime() + 60000).length, 0);
  assert.equal(findChairConflicts([{ ...appointment, status: "completed" }], first.getTime(), first.getTime() + 60000).length, 1);
});
test("closed Saturdays, early/late appointments and invalid durations are rejected", () => {
  const slot = (date, time, duration) => validateChairSlot({ date, time, durationMinutes: duration });
  assert.match(slot("2026-10-17", "13:00", 30).message, /closed Saturdays/);
  assert.match(slot("2026-10-18", "10:00", 30).message, /studio hours/);
  assert.match(slot("2026-10-18", "19:45", 30).message, /studio hours/);
  assert.match(slot("2026-10-18", "11:00", 10).message, /15-minute/);
  assert.equal(slot("2026-10-18", "11:00", 60).ok, true);
});
