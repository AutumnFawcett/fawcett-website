import test from "node:test";
import assert from "node:assert/strict";
import { edmontonDateTime } from "../../lib/scheduling/sharedChair.mjs";
import {
  appointmentsForDay, calendarLabel, clockLabel, countAppointmentsForDay,
  slotsForDay, timelinePlacement, weekDaysFor,
} from "../../lib/scheduling/visualCalendar.mjs";

const future = Date.parse("2026-10-17T10:00:00Z");
const slotDate = "2026-10-18";
const ben = {
  id: "ben-1", assignedInbox: "ben", status: "tentative", title: "Tattoo",
  startAt: edmontonDateTime(slotDate,"12:00"), endAt: edmontonDateTime(slotDate,"14:00"),
};
const autumn = {
  id: "autumn-1", assignedInbox: "autumn", status: "confirmed", title: "Design",
  startAt: edmontonDateTime(slotDate,"15:30"), endAt: edmontonDateTime(slotDate,"16:00"),
};

test("shows correct Edmonton time labels and Sunday-first week", () => {
  assert.equal(clockLabel("13:30"), "1:30 PM");
  assert.equal(clockLabel("11:00"), "11:00 AM");
  assert.equal(calendarLabel(slotDate, { weekday:"short" }), "Sun");
  assert.deepEqual(weekDaysFor("2026-10-19"), [
    "2026-10-18","2026-10-19","2026-10-20","2026-10-21",
    "2026-10-22","2026-10-23","2026-10-24",
  ]);
});

test("slots always block both artists for one chair; adjacent starts permitted", () => {
  const slots = slotsForDay(slotDate, 60, [ben, autumn], future);
  const at = time => slots.find(slot => slot.time === time);
  assert.equal(at("11:00").available, true);
  assert.equal(at("11:30").available, false);
  assert.equal(at("12:00").available, false);
  assert.equal(at("13:30").available, false);
  assert.equal(at("14:00").available, true);
  assert.equal(at("15:00").available, false);
  assert.equal(at("16:00").available, true);
  assert.equal(at("19:00").available, true);
  assert.equal(at("19:30"), undefined);
  assert.equal(at("12:00").reason, "Chair occupied");
});

test("cancelled appointments do not consume chair; Saturday has no slots", () => {
  const cancelled = { ...ben, status:"cancelled" };
  assert.equal(slotsForDay(slotDate, 60, [cancelled], future).find(s => s.time === "12:00").available, true);
  assert.deepEqual(slotsForDay("2026-10-17", 60, [], future), []);
  assert.deepEqual(slotsForDay(slotDate, 10, [], future), []);
});

test("past slots are not offered to book; no fake free times", () => {
  const now = Date.parse("2026-10-18T19:10:00Z"); // 1:10 PM Edmonton
  const slots = slotsForDay(slotDate, 60, [], now);
  assert.equal(slots.find(s => s.time === "13:00").available, false);
  assert.equal(slots.find(s => s.time === "13:30").available, true);
});

test("visual artist filter never affects chair availability", () => {
  assert.deepEqual(appointmentsForDay([ben,autumn],slotDate,"ben").map(a=>a.id), ["ben-1"]);
  assert.equal(countAppointmentsForDay([ben,autumn],slotDate), 2);
  const slots = slotsForDay(slotDate,60,[ben,autumn],future);
  assert.equal(slots.find(s=>s.time==="15:00").available,false);
});

test("visual event placement reflects actual duration and handles legacy outside hours", () => {
  assert.equal(Math.round(timelinePlacement(ben).top),11);
  assert.equal(Math.round(timelinePlacement(ben).height),22);
  const early = { startAt: edmontonDateTime(slotDate,"10:00"), endAt: edmontonDateTime(slotDate,"12:00") };
  assert.equal(timelinePlacement(early).clipped, true);
  assert.equal(timelinePlacement({ startAt: edmontonDateTime(slotDate,"09:00"),endAt: edmontonDateTime(slotDate,"10:00") }), null);
});
