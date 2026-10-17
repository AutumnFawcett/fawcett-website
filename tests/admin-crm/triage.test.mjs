import test from "node:test";
import assert from "node:assert/strict";
import {
  consultPlanId,
  consultPlanLabel,
  consultNeedsReview,
  consultTriageSummary,
  exactClientUidMatch,
} from "../../lib/admin/crmTriage.mjs";

const budgets = {
  starter: "Project budget: $2,000\nPayment plan request: Starter ($500 initial + $150/month); application only, subject to final terms.",
  builder: "Payment plan request: Builder ($750 initial + $300/month); application only, subject to final terms.",
  commitment: "Payment plan request: Commitment ($1,000 initial + $500/month); application only, subject to final terms.",
};

test("recognizes existing request-only plan markers without changing budget", () => {
  for (const id of Object.keys(budgets)) {
    assert.equal(consultPlanId(budgets[id]), id);
    assert.equal(consultPlanLabel(budgets[id]), id[0].toUpperCase() + id.slice(1));
  }
  for (const original of ["$500 budget", "", null, undefined, "Starter monthly payment received", "Payment plan request: Starter"]) {
    assert.equal(consultPlanId(original), null);
  }
});

test("new and actively reviewing consultations are counted separately from other statuses", () => {
  const consults = [
    { status: "new", request: { budgetRange: budgets.starter } },
    { status: "reviewing", request: { budgetRange: budgets.builder } },
    { status: "closed", request: { budgetRange: "No preference" } },
    { status: "estimate_needed", request: { budgetRange: budgets.commitment } },
    { status: "needs_more_info", request: { budgetRange: "" } },
    { request: {} },
  ];
  assert.deepEqual(consultTriageSummary(consults), {
    total: 6, newCount: 2, reviewCount: 4, planCount: 3,
  });
  assert.equal(consultNeedsReview("closed"), false);
  assert.equal(consultNeedsReview("new"), true);
});

test("client navigation only resolves unambiguous exact Auth UID matches", () => {
  const clients = [{ key: "one", clientUid: "uid-a", clientEmail: "same@example.invalid" }, { key: "two", clientUid: "uid-b", clientEmail: "same@example.invalid" }];
  assert.equal(exactClientUidMatch(clients, "uid-b")?.key, "two");
  assert.equal(exactClientUidMatch(clients, "unknown"), null);
  assert.equal(exactClientUidMatch(clients, ""), null);
  assert.equal(exactClientUidMatch([...clients, { key: "dup", clientUid: "uid-b" }], "uid-b"), null);
});
