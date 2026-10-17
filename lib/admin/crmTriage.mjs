// Display-only triage helpers for the existing consultation schema.
// A payment-plan preference is never billing authorization, paid status or credit.
const PLAN_LINES = Object.freeze({
  starter: "Payment plan request: Starter ($500 initial + $150/month); application only, subject to final terms.",
  builder: "Payment plan request: Builder ($750 initial + $300/month); application only, subject to final terms.",
  commitment: "Payment plan request: Commitment ($1,000 initial + $500/month); application only, subject to final terms.",
});

export const planFilterOptions = Object.freeze([
  { value: "starter", label: "Starter" },
  { value: "builder", label: "Builder" },
  { value: "commitment", label: "Commitment" },
]);

export function consultPlanId(budgetRange) {
  if (typeof budgetRange !== "string") return null;
  const lines = budgetRange.split(/\r?\n/).map((line) => line.trim());
  return Object.keys(PLAN_LINES).find((id) => lines.includes(PLAN_LINES[id])) || null;
}

export function consultPlanLabel(budgetRange) {
  const id = consultPlanId(budgetRange);
  return planFilterOptions.find((item) => item.value === id)?.label || null;
}

export function consultNeedsReview(status) {
  return ["new", "reviewing", "estimate_needed"].includes(status || "new");
}

export function consultTriageSummary(consults) {
  return {
    total: consults.length,
    newCount: consults.filter((consult) => !consult.status || consult.status === "new").length,
    reviewCount: consults.filter((consult) => consultNeedsReview(consult.status)).length,
    planCount: consults.filter((consult) => Boolean(consultPlanId(consult.request?.budgetRange))).length,
  };
}

// Never infer client ownership by matching an email or name.
export function exactClientUidMatch(clients, uid) {
  if (typeof uid !== "string" || !uid) return null;
  const matches = clients.filter((client) => client.clientUid === uid);
  return matches.length === 1 ? matches[0] : null;
}
