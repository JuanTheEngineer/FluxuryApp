/// <reference types="vite/client" />
/**
 * Canonical_API_Surface — the single entry point for API access.
 *
 * Reads VITE_DEMO_MODE at module load and selects either the mock or real
 * implementation. Callers (Pinia stores) import from here and never need to
 * know which mode is active.
 *
 * Precedence (Req 10.1, 10.3):
 *   - undefined / empty   -> Demo (default)
 *   - "true"              -> Demo
 *   - any other value     -> Real
 */

import * as mock from './mock'
import * as real from './real'
import type {
  SessionsApiContract,
  BeatsApiContract,
  AuthApiContract,
  StorageApiContract,
} from './contracts'

/**
 * Resolve demo-vs-real from a `VITE_DEMO_MODE`-style env value.
 *
 * Exported for testing — `vi.stubEnv('VITE_DEMO_MODE', ...)` + `vi.resetModules()`
 * is the supported way to exercise the precedence rule in tests (Req 4.5, 4.6).
 */
export function resolveDemoMode(env: ImportMetaEnv = import.meta.env): boolean {
  const raw = env.VITE_DEMO_MODE
  if (raw === undefined || raw === '') return true
  return raw === 'true'
}

export const isDemoMode: boolean = resolveDemoMode()

const impl = isDemoMode ? mock : real

export const sessionsApi: SessionsApiContract = impl.sessionsApi
export const beatsApi: BeatsApiContract = impl.beatsApi
export const authApi: AuthApiContract = impl.authApi
export const storageApi: StorageApiContract = impl.storageApi

// Reset action — only meaningful in demo mode but safe to import in either.
export { resetMockBackend } from './reset'

// Public type surface — callers do `import type { SessionSummary } from '@/services/api'`.
export type * from './contracts'
export type * from './types'
