import base from './playwright.config'
import { defineConfig } from '@playwright/test'

// The e2e tests (demo mode) on a port of their own, with a fresh server.
// Use this when a dev server is already running on 5173: the default config
// would reuse it, and in beta mode that has no demo data or login.
// Run with: npx playwright test --config playwright.local.config.ts
const PORT = 5196
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { VITE_DEMO_MODE: 'true' },
  },
})
