import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync(new URL("../../components/AdminScheduleCalendar.js", import.meta.url), "utf8");
const localCSS = readFileSync(new URL("../../components/AdminScheduleCalendar.module.css", import.meta.url), "utf8");
const globalCSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

test("calendar directly imports its own scoped stylesheet", () => {
  assert.match(component, /import styles from "\.\/AdminScheduleCalendar\.module\.css"/);
  assert.match(localCSS, /\.fc-calendar\s*\{/);
  assert.doesNotMatch(globalCSS, /\.fc-calendar\s*\{/);
});

test("all referenced calendar CSS Module class names are defined", () => {
  const classes = [
    ...Array.from(component.matchAll(/styles\["([^"]+)"\]/g), (match) => match[1]),
    ...Array.from(component.matchAll(/styles\.(\w+)/g), (match) => match[1]),
  ];
  assert.ok(classes.length > 35);
  for (const className of classes) {
    assert.ok(localCSS.includes("." + className), "Missing CSS selector: " + className);
  }
});

test("calendar remains responsive and appointment states have styles", () => {
  for (const selector of [
    ".fc-week-timeline", ".fc-mobile-agenda", ".fc-slot-grid",
    ".fc-appointment", ".fc-appointment-autumn", ".fc-appointment-general",
    ".fc-cancelled", ".fc-month-grid", ".fc-timeline-track", ".fc-day-strip",
  ]) assert.ok(localCSS.includes(selector), "Missing " + selector);
  assert.match(localCSS, /@media \(max-width: 950px\)/);
  assert.match(localCSS, /@media \(max-width: 540px\)/);
});
