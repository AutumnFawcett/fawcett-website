import { test, expect } from '@playwright/test';

test.skip(!process.env.TEST_FIREBASE_MISSING, 'Run against a build made without Firebase configuration.');
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});

for (const path of ['/admin/clients', '/admin/consults', '/admin/payments', '/portal/messages', '/tattoo-portal', '/consult?plan=builder']) {
  test(`controlled configuration error and no Firebase traffic: ${path}`, async ({ page, context }) => {
    const external = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
      external.push(url.hostname);
      return route.abort();
    });
    await page.goto(path);
    await expect(page.getByRole('alert').filter({ hasText: 'Firebase configuration is missing or invalid' })).toContainText('Firebase configuration is missing or invalid');
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
    expect(external.filter((host) => /googleapis|firebase|square/i.test(host))).toEqual([]);
    expect(errors).toEqual([]);
    await expect(page.getByRole('button', { name: 'Submit Consult Request', exact: true })).toHaveCount(0);
  });
}
test('public plans remain usable with missing Firebase configuration', async ({ page }) => {
  await page.goto('/tattoo-project-membership');
  await expect(page.getByRole('link', { name: 'Request Builder plan' })).toBeVisible();
  await page.getByRole('link', { name: 'Request Builder plan' }).click();
  await expect(page).toHaveURL(/consult\?plan=builder/);
  await expect(page.getByRole('alert').filter({ hasText: 'Firebase configuration is missing or invalid' })).toBeVisible();
});
