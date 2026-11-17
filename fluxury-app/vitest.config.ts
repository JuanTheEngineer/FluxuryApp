import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Unit tests always run against the mock backend, whatever .env.local says
    // (a dev .env.local pointing at beta made all 155 tests hit the network).
    env: { VITE_DEMO_MODE: 'true' },
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
})
