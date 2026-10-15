import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { holidayReference, holidayReport } from "../../lib/holidays/service.mjs";
import { localStamp } from "../../lib/scheduling/model.mjs";
const find = id => holidayReference.records.find(r => r.id === id);
test("reference reproduces exactly from pinned offline source packages", () => {
  assert.match(execFileSync(process.execPath, ["scripts/generate-holiday-reference.mjs", "--check"], { encoding: "utf8" }), /reproducibility verified/);
  assert.equal(new Set(holidayReference.records.map(r => r.id)).size, holidayReference.records.length);
});
test("Passover and Hanukkah anchors include the correct eve and complete Diaspora interval", () => {
  const pesach = find("jewish-pesach-5786");
  assert.equal(pesach.observedStart, "2026-04-02"); assert.equal(pesach.observedEnd, "2026-04-09");
  assert.equal(localStamp(pesach.start, "America/Edmonton").slice(0, 10), "2026-04-01");
  assert.equal(localStamp(pesach.end, "America/Edmonton").slice(0, 10), "2026-04-09");
  assert.ok(pesach.end - pesach.start > 8 * 86400000);
  const chanukah = find("jewish-chanukah-5787"); assert.equal(chanukah.startDate, "2026-12-04"); assert.equal(chanukah.endDate, "2026-12-12");
});
test("Western Gregorian Easter and Alberta general holiday anchors stay distinct", () => {
  assert.equal(find("western_christian-easter-sunday-2026-04-05").category, "western_christian");
  assert.equal(find("alberta-family-day-2026-02-16").observedStart, "2026-02-16");
  assert.equal(find("alberta-victoria-day-2026-05-18").observedStart, "2026-05-18");
  const goodFriday = holidayReference.records.filter(r => r.name === "Good Friday" && r.startDate === "2026-04-03");
  assert.deepEqual(goodFriday.map(r => r.category).sort(), ["alberta", "western_christian"]);
});
test("reference-only holidays never carry default closures and missing years are explicit", () => {
  const report = holidayReport([], "2026-04-01", "2026-04-09");
  assert.ok(report.calendar.every(r => r.state === "reminder")); assert.equal(report.coverageAvailable, true);
  const unknown = holidayReport([], "2033-01-01", "2033-01-31"); assert.equal(unknown.coverageAvailable, false); assert.equal(unknown.calendar.length, 0);
});
