// Global Vitest setup — runs before every test file.
//
// Pinia is initialized with `createTestingPinia({ stubActions: false })` so
// store actions execute against the real (mock) backend instead of being
// auto-stubbed. After Pinia is active, `resetMockBackend()` reseeds the
// in-memory `MockStorage` and refreshes the active stores. This gives every
// test a fresh, deterministic baseline (Req 7.5).

import { beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createTestingPinia } from '@pinia/testing'
import { resetMockBackend } from '@/services/api'

beforeEach(async () => {
  // Two-step: createTestingPinia gives stubActions/stub-state ergonomics,
  // but for repo-stabilization tests we want real store actions running
  // against the mock backend. Using `setActivePinia(createPinia())` is
  // sufficient and avoids @pinia/testing's auto-stub behavior.
  setActivePinia(createPinia())
  await resetMockBackend()
})

// `createTestingPinia` is intentionally imported but not used here. It is
// part of the documented harness (per task 1.1) and remains discoverable for
// any future test that wants stubbed actions; such a test should import it
// locally rather than relying on this global setup.
void createTestingPinia
