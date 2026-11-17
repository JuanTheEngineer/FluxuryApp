import { defineConfig, devices } from '@playwright/test'

/**
 * Beta tests: run against the DEPLOYED beta (real Cognito, API Gateway, DynamoDB, S3).
 * No local dev server. Run with: npm run test:beta
 *
 * Requires a dedicated test account:
 *   FLUXURY_BETA_TEST_USERNAME, FLUXURY_BETA_TEST_PASSWORD
 * Optional:
 *   FLUXURY_BETA_BASE_URL (default https://www.fluxury.app)
 *   FLUXURY_BETA_LOCAL=1  test LOCAL code against the beta backend before deploying:
 *                         starts `vite --mode beta` on localhost:5173 and targets it
 */
const local = process.env.FLUXURY_BETA_LOCAL === '1'

export default defineConfig({
  testDir: './tests/beta',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-beta' }]],
  use: {
    baseURL: local
      ? 'http://localhost:5173'
      : process.env.FLUXURY_BETA_BASE_URL || 'https://www.fluxury.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(local
    ? {
        webServer: {
          // .env.beta is loaded by --mode beta; note .env.local still overrides it
          command: 'npx vite --mode beta --port 5173 --strictPort',
          url: 'http://localhost:5173',
          reuseExistingServer: false,
          timeout: 60_000,
        },
      }
    : {}),
})
