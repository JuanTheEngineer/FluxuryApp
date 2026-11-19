import { defineConfig, devices } from '@playwright/test'

// Throwaway spike tests (Quill line times). Local only: serves spikes/ with vite.
// Run with: npx playwright test --config playwright.spike.config.ts
export default defineConfig({
  testDir: './tests/spike',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5199',
    ...devices['iPhone 13'],
    browserName: 'chromium',
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199/spikes/quill-line-time/index.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
