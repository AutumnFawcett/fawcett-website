import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentPlans, getPaymentPlan, consultationBudget } from '../../lib/paymentPlans.mjs';

test('approved plan amounts and stable request IDs', () => {
  assert.deepEqual(paymentPlans.map(({ id, initial, monthly }) => [id, initial, monthly]), [
    ['starter', '$500', '$150'], ['builder', '$750', '$300'], ['commitment', '$1,000', '$500'],
  ]);
});
test('each preference survives the existing budget field and conversation summary workflow', () => {
  for (const plan of paymentPlans) {
    const budget = consultationBudget('  Approx. $4,000 project  ', plan.id);
    assert.ok(budget.startsWith('Approx. $4,000 project\n'));
    assert.ok(budget.includes(`${plan.name} (${plan.initial} initial + ${plan.monthly}/month)`));
    assert.ok(budget.includes('application only, subject to final terms'));
    assert.equal(consultationBudget('', plan.id), budget.split('\n')[1]);
  }
});
test('ordinary consultations preserve their original budget and no selection can imply enrollment', () => {
  assert.equal(consultationBudget('  $500–$900  ', ''), '$500–$900');
  assert.equal(consultationBudget('', ''), '');
  for (const invalid of ['__proto__', 'STARTER', 'unknown', ['starter'], null, undefined]) {
    assert.equal(getPaymentPlan(invalid), null);
    assert.equal(consultationBudget('Original budget', invalid), 'Original budget');
  }
});
