// Request-only planning options. These values never authorize or collect payment.
export const paymentPlans = [
  { id: "starter", name: "Starter", initial: "$500", monthly: "$150", description: "A comfortable starting point for your next custom piece." },
  { id: "builder", name: "Builder", initial: "$750", monthly: "$300", description: "Build toward a larger piece or a project across several sessions." },
  { id: "commitment", name: "Commitment", initial: "$1,000", monthly: "$500", description: "Plan ahead for ambitious, large-scale tattoo work." },
];

export function getPaymentPlan(id) {
  return paymentPlans.find((plan) => plan.id === id) || null;
}

// Keep the existing consultation schema and admin inbox compatible.
// A preference is descriptive text, never a payment status or enrollment.
export function consultationBudget(budget, planId) {
  const plan = getPaymentPlan(planId);
  const text = budget.trim();
  if (!plan) return text;
  const preference = `Payment plan request: ${plan.name} (${plan.initial} initial + ${plan.monthly}/month); application only, subject to final terms.`;
  return text ? `${text}\n${preference}` : preference;
}
