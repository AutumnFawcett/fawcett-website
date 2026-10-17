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

test('full admin-visible message summary includes each selected preference beyond the preview', async () => {
  const { buildConsultSummary } = await import('../../lib/consultSummary.mjs');
  const form = {
    fullName: 'Synthetic Client', email: 'client@example.invalid', phone: '000-000-0000',
    preferredContactMethod: 'email', preferredArtist: 'ben', projectType: 'custom_tattoo',
    placement: 'upper arm', bodySide: 'left', approximateSize: '6 inches',
    colourPreference: 'black_and_grey', tattooIdea: 'Fictional flower', budgetRange: '$4,000 project',
  };
  for (const plan of paymentPlans) {
    const summary = buildConsultSummary(form, plan.id);
    const preference = consultationBudget(form.budgetRange, plan.id);
    assert.ok(summary.includes(`Budget range: ${preference}`));
    assert.ok(summary.indexOf('Payment plan request:') > 140);
    assert.ok(summary.includes('Fictional flower'));
    assert.ok(summary.includes('subject to final terms'));
  }
  assert.ok(buildConsultSummary(form).includes('Budget range: $4,000 project\n'));
  assert.ok(!buildConsultSummary(form).includes('Payment plan request:'));
});
