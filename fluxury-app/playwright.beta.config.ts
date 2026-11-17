import { defineConfig, devices } from '@playwright/test'

/**
 * Beta tests: run against the DEPLOYED beta (real Cognito, API Gateway, DynamoDB, S3).
 * No local dev server. Run with: npm run test:beta
 *
 * Requires a dedicated test account:
 *   FLUXURY_BETA_TEST_USERNAME, FLUXURY_BETA_TEST_PASSWORD
 * Optional:
 *   FLUXURY_BETA_BASE_URL (default https://www.fluxury.app)
 */
export default defineConfig({
  testDir: './tests/beta',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-beta' }]],
  use: {
    baseURL: process.env.FLUXURY_BETA_BASE_URL || 'https://www.fluxury.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
