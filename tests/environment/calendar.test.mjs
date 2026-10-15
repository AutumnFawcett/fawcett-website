import { test } from "node:test";
import assert from "node:assert/strict";
import { range, navigateDate, wall } from "../../lib/scheduling/calendar.mjs";
test("day/week/month/agenda ranges remain deterministic across year, leap day and DST boundaries", () => {
  assert.deepEqual(range("2030-01-07", "day"), ["2030-01-07"]);
  assert.deepEqual(range("2030-01-09", "week"), ["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11", "2030-01-12", "2030-01-13"]);
  const month = range("2028-02-29", "month"); assert.equal(month.length, 42); assert.ok(month.includes("2028-02-29"));
  assert.equal(navigateDate("2030-01-31", "month", 1), "2030-02-01");
  assert.equal(navigateDate("2030-01-31", "month", -1), "2029-12-01");
  assert.equal(range("2030-03-10", "agenda").length, 7);
});
test("calendar wall times use studio timezone rather than browser timezone", () => {
  assert.equal(wall(Date.parse("2030-01-08T01:00:00Z"), "America/Edmonton"), "2030-01-07T18:00");
  assert.equal(wall(Date.parse("2030-01-08T01:00:00Z"), "America/Toronto"), "2030-01-07T20:00");
  assert.equal(wall(null, "America/Edmonton"), "");
});
