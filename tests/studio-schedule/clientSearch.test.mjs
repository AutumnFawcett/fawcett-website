import test from "node:test";
import assert from "node:assert/strict";
import { filterScheduleClients, formatBookingDuration } from "../../lib/scheduling/clientSearch.mjs";

const clients = [
  { key: "first", clientName: "Jane Sample", clientEmail: "jane@studio.invalid", phone: "780-111-1111" },
  { key: "second", clientName: "Janet Example", clientEmail: "different@studio.invalid" },
  { key: "third", clientName: "JANE Sample", clientEmail: "duplicate@studio.invalid" },
  { key: "fourth", clientName: "Élodie", clientEmail: "elodie@studio.invalid" },
];

test("finds by name, email or phone and keeps distinct client keys", () => {
  assert.deepEqual(filterScheduleClients(clients, "jane").map(x => x.key), ["first", "third"]);
  assert.deepEqual(filterScheduleClients(clients, " DIFFERENT@").map(x => x.key), ["second"]);
  assert.deepEqual(filterScheduleClients(clients, "780-111").map(x => x.key), ["first"]);
  assert.deepEqual(filterScheduleClients(clients, "elodie").map(x => x.key), ["fourth"]);
});

test("does not return a long unfiltered client directory and limits suggestions", () => {
  assert.deepEqual(filterScheduleClients(clients, ""), []);
  assert.deepEqual(filterScheduleClients(clients, "missing"), []);
  assert.deepEqual(filterScheduleClients(clients, "jan", 1).map(x => x.key), ["first"]);
  assert.deepEqual(filterScheduleClients(null, "jan"), []);
});

test("translates minute durations to readable appointment lengths", () => {
  assert.equal(formatBookingDuration("30"), "30 minutes");
  assert.equal(formatBookingDuration("60"), "1 hour");
  assert.equal(formatBookingDuration("90"), "1 hour 30 minutes");
  assert.equal(formatBookingDuration("480"), "8 hours");
  assert.equal(formatBookingDuration("495"), "8 hours 15 minutes");
  assert.equal(formatBookingDuration(""), "");
  assert.equal(formatBookingDuration("-5"), "");
});
