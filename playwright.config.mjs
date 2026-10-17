import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/payment-plans/browser',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://127.0.0.1:3100',
    // A cached server can serve an older build/configuration and invalidate this test.
    reuseExistingServer: false,
  },
});
