import { test, expect } from '@playwright/test';

// No browser test can contact Firebase, Square or any other external service.
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
});

for (const width of [390, 1280]) {
  test(`responsive plans and consultation handoff at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tattoo-project-membership');
    await expect(page.getByRole('heading', { name: 'Choose your starting point.' })).toBeVisible();
    await expect(page.getByText('Applications open · No payment collected · No recurring subscription activated')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const [name, id] of [['Starter', 'starter'], ['Builder', 'builder'], ['Commitment', 'commitment']]) {
      await page.getByRole('link', { name: `Request ${name} plan` }).click();
      await expect(page).toHaveURL(new RegExp(`/consult\\?plan=${id}#consult-form`));
      await expect(page.getByRole('combobox', { name: 'Payment plan preference (optional)' })).toHaveValue(id);
      await expect(page.getByRole('button', { name: 'Create Tattoo Portal Login', exact: true })).toBeVisible();
      await page.goto('/tattoo-project-membership');
    }
  });
}

test('ordinary and invalid requests remain ordinary; preference is editable before login', async ({ page }) => {
  for (const suffix of ['', '?plan=unknown', '?plan=starter&plan=builder']) {
    await page.goto(`/consult${suffix}`);
    const selector = page.getByRole('combobox', { name: 'Payment plan preference (optional)' });
    await expect(selector).toHaveValue('');
    await selector.selectOption('commitment');
    await expect(selector).toHaveValue('commitment');
    await selector.selectOption('');
    await page.getByRole('button', { name: 'Already have a login? Log in instead.' }).click();
    await expect(page.getByRole('button', { name: 'Log In', exact: true })).toBeVisible();
    await expect(selector).toHaveValue('');
  }
});

test('home promotes the same plan request page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Explore Payment Plans', exact: true }).click();
  await expect(page).toHaveURL(/\/tattoo-project-membership$/);
  await expect(page.getByRole('link', { name: 'Request Starter plan' })).toHaveAttribute('href', '/consult?plan=starter#consult-form');
});

test('existing account can log in without losing the selected plan or consultation fields', async ({ page }) => {
  // Synthetic Auth transport only; no request is sent to Firebase.
  const uid = 'synthetic-payment-plan-client';
  const email = 'client@example.invalid';
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const idToken = `${encode({ alg: 'none' })}.${encode({ sub: uid, user_id: uid, email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, aud: 'demo-fawcett-dev' })}.synthetic`;
  await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    const body = route.request().url().includes('accounts:lookup')
      ? { users: [{ localId: uid, email, displayName: 'Synthetic Client', emailVerified: false, providerUserInfo: [{ providerId: 'password', email }] }] }
      : { localId: uid, email, idToken, refreshToken: 'synthetic-refresh-token', expiresIn: '3600', registered: true };
    await route.fulfill({ json: body });
  });
  await page.goto('/consult?plan=builder');
  await page.getByRole('button', { name: 'Already have a login? Log in instead.' }).click();
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tell us about your tattoo idea' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Payment plan preference (optional)' })).toHaveValue('builder');
  for (const name of ['Tattoo Idea', 'Placement', 'Approximate Size', 'Budget Range']) {
    await expect(page.getByRole('textbox', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Submit Consult Request' })).toBeVisible();
});
