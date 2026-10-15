// Offline development tool only; no Firebase, network, credentials or family data.
import fs from "node:fs";
import assert from "node:assert/strict";
import { HebrewCalendar, Zmanim, GeoLocation, flags } from "@hebcal/core";
import Holidays from "date-holidays";
import { easter } from "date-easter";
process.env.TZ = "UTC";
const firstYear = 2026, lastYear = 2031, zone = "America/Edmonton";
const versions = { "@hebcal/core": "6.14.4", "date-holidays": "3.37.0", "date-easter": "1.0.3" };
for (const [name, version] of Object.entries(versions)) assert.equal(JSON.parse(fs.readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url))).version, version);
const geo = new GeoLocation("Edmonton city-centre reference", 53.5461, -113.4938, 0, zone);
const isoDay = date => date.toISOString().slice(0, 10);
const shift = (date, n) => new Date(date.getTime() + n * 86400000);
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
const civilInstant = date => {
  // All chosen western/Alberta dates use modern Edmonton midnight (no DST transition).
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  for (const hours of [6, 7]) {
    const ms = Date.parse(`${date}T00:00:00Z`) + hours * 3600000;
    const p = Object.fromEntries(parts.formatToParts(new Date(ms)).map(v => [v.type, v.value]));
    if (`${p.year}-${p.month}-${p.day}` === date && p.hour === "00") return ms;
  }
  throw new Error("Unreviewed Edmonton civil offset");
};
const records = [];
const selected = new Set(["Pesach", "Shavuot", "Rosh Hashana", "Yom Kippur", "Sukkot", "Shmini Atzeret", "Simchat Torah", "Chanukah", "Purim", "Tu BiShvat", "Tish'a B'Av"]);
const groups = new Map();
for (let year = firstYear - 1; year <= lastYear + 1; year++) {
  for (const event of HebrewCalendar.calendar({ year, il: false, noRoshChodesh: true, noModern: true, noMinorFast: true })) {
    const base = event.basename();
    if (!selected.has(base) || (event.getFlags() & flags.EREV) !== 0) continue;
    const key = `${slug(base)}-${event.getDate().getFullYear()}`;
    const dates = groups.get(key) || { name: base === "Pesach" ? "Passover (Pesach)" : base, dates: [] };
    dates.dates.push(event.getDate().greg()); groups.set(key, dates);
  }
}
for (const [key, group] of groups) {
  group.dates.sort((a, b) => a - b);
  const first = group.dates[0], last = group.dates.at(-1), eve = shift(first, -1);
  const start = new Zmanim(geo, eve, false).sunset(), end = new Zmanim(geo, last, false).tzeit(8.5);
  assert.ok(Number.isFinite(start.getTime()) && end > start);
  if (isoDay(last) < `${firstYear}-01-01` || isoDay(eve) > `${lastYear}-12-31`) continue;
  records.push({ id: `jewish-${key}`, category: "jewish", name: group.name, observedStart: isoDay(first), observedEnd: isoDay(last), startDate: isoDay(eve), endDate: isoDay(last), start: start.getTime(), end: end.getTime(), convention: "Diaspora; city-centre sunset to 8.5-degree nightfall; approximate, not an observance ruling", source: "hebcal" });
}
for (let year = firstYear; year <= lastYear; year++) {
  const e = easter(year), sunday = new Date(Date.UTC(e.year, e.month - 1, e.day));
  const western = [["Good Friday", shift(sunday, -2)], ["Easter Sunday", sunday], ["Easter Monday", shift(sunday, 1)], ["Christmas Eve", new Date(Date.UTC(year, 11, 24))], ["Christmas Day", new Date(Date.UTC(year, 11, 25))]];
  const addCivil = (category, name, date, source, classification) => {
    const day = date.slice(0, 10), next = isoDay(shift(new Date(`${day}T00:00:00Z`), 1));
    records.push({ id: `${category}-${slug(name)}-${day}`, category, name, startDate: day, endDate: day, observedStart: day, observedEnd: day, start: civilInstant(day), end: civilInstant(next), source, classification });
  };
  western.forEach(([name, date]) => addCivil("western_christian", name, isoDay(date), "western", "Gregorian Western reference; no closure implied"));
  const alberta = new Holidays("CA", "AB");
  for (const holiday of alberta.getHolidays(year).filter(h => ["public", "optional"].includes(h.type))) addCivil("alberta", holiday.name, holiday.date, "alberta", `${holiday.type === "public" ? "General holiday reference" : "Optional holiday reference"}; substitute-day and employment treatment require owner review`);
}
records.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
assert.equal(new Set(records.map(r => r.id)).size, records.length);
const output = { schemaVersion: 1, version: "edmonton-2026-2031-v1", firstYear, lastYear, timezone: zone,
  location: { name: "Edmonton city-centre reference", latitude: 53.5461, longitude: -113.4938, elevationAdjustment: false, source: "https://www.geonames.org/5946768/edmonton.html" },
  dataLicense: "CC-BY-SA-3.0 (reference data only; see docs/holiday-reference-attribution.md)",
  sources: {
    hebcal: { package: "@hebcal/core", version: versions["@hebcal/core"], url: "https://www.hebcal.com/holidays/", algorithm: "Hebcal Hebrew calendar and NOAA solar calculations; dev tool GPL-2.0-or-later" },
    western: { package: "date-easter", version: versions["date-easter"], url: "https://aa.usno.navy.mil/faq/easter", algorithm: "Gregorian Easter; Good Friday -2 days; Easter Monday +1; fixed Christmas dates" },
    alberta: { package: "date-holidays", version: versions["date-holidays"], url: "https://www.alberta.ca/alberta-general-holidays", data: "https://github.com/commenthol/date-holidays/blob/master/data/countries/CA.yaml", attribution: "date-holidays / Holger (commenthol) and contributors; upstream LICENSE data CC-BY-SA-3.0 (package SPDX says CC-BY-3.0), code ISC; derived selected CA/AB public/optional date facts" }
  }, records };
const body = JSON.stringify({ ...output, records: [] }, null, 2).replace('"records": []', '"records": [\n' + records.map(r => "    " + JSON.stringify(r)).join(",\n") + "\n  ]") + "\n", path = new URL("../data/holiday-reference.json", import.meta.url);
if (process.argv.includes("--check")) assert.equal(fs.readFileSync(path, "utf8"), body, "Holiday reference changed: regenerate and review, do not auto-approve closures");
else fs.writeFileSync(path, body);
console.log(`${records.length} offline holiday references, ${firstYear}–${lastYear}; ${process.argv.includes("--check") ? "reproducibility verified" : "generated for review"}.`);
