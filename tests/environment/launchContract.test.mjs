import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { QUERIES, QUERY_CONTRACT_VERSION } from "../../operator/query-index-contract.mjs";
import { ALL_ROOTS, SOURCE_ROOTS, knownCollection, NAMESPACE_VERSION } from "../../operator/namespaces.mjs";
import { createProductionOperator } from "../../operator/runtime.mjs";
test("launch namespace and query contracts are versioned and reference current implementation files", () => {
  assert.equal(NAMESPACE_VERSION, "launch-namespaces-v1"); assert.equal(QUERY_CONTRACT_VERSION, "launch-queries-v1");
  assert.equal(new Set(ALL_ROOTS).size, ALL_ROOTS.length); assert.equal(new Set(QUERIES.map(q => q.id)).size, QUERIES.length);
  for (const q of QUERIES) { assert.ok(q.collections.length && q.index); for (const source of q.sources) assert.ok(fs.existsSync(source), source); }
  assert.ok(QUERIES.find(q => q.id === "square-order-identity").filters.some(f => f[0] === "environment"));
  for (const root of ["studioPayments", "schedulingHolidayPolicies", "scheduleReservations", "adminConversationReceipts"]) assert.ok(SOURCE_ROOTS.includes(root));
});
test("known private child contracts do not authorize arbitrary deeper or financial publication namespaces", () => {
  assert.equal(knownCollection("publicationRecords/clients/records/id/history"), true);
  assert.equal(knownCollection("studioPayments/id/audit"), true);
  for (const path of ["portalRecords/studioPayments/records", "studioPayments/id/unknown", "studioPayments/id/audit/a/deeper", "portalRecords/unknown/records"]) assert.equal(knownCollection(path), false);
  assert.throws(createProductionOperator, /production_execution_disabled_pending_separate_review/);
});
