# Design Document

## Overview

This design implements the **repo-stabilization** spec: a foundation-layer refactor that fixes wiring inconsistencies, eliminates throwing stub modules, introduces an enforced layering invariant, and stands up a Vitest + Playwright test harness with CI-friendly scripts. The deliverable is technical-debt repayment — no user-visible features change, but the data flow and the developer feedback loop become trustworthy enough for **visual-foundation** and **creative-core-loop** to build on.

The core architectural move is collapsing every API entry point into a single **Canonical_API_Surface** module (`@/services/api`) that owns the mock-vs-real selection internally. Views talk only to Pinia stores; stores talk only to the canonical surface; the surface talks to either the in-memory mock backend or the AWS-backed clients. This boundary is enforced at three layers: TypeScript types (interface contracts), ESLint rules (`no-restricted-imports` with per-path overrides), and a Vitest AST scan (belt-and-suspenders).

The design intentionally keeps the choice of mock vs real **invisible to callers**. Stores and views never check `VITE_DEMO_MODE`. The only modules that read that variable are the canonical surface itself and the DemoBanner.

## Architecture

### Module graph after stabilization

```
┌──────────────────────────────────────────────────────────────┐
│ Vue views (src/views/**/*.vue)                               │
│   - SessionBrowserView, SessionEditorView, BeatBrowserView,  │
│     AddBeatView, HomeView                                    │
│   - Imports allowed: @/stores/**, @/components/**,           │
│     @/composables/**, vue, vue-router                        │
│   - Imports forbidden: @/api/**, @/services/api/**,          │
│     @/services/demoApiClients, @/services/mockApiService     │
└─────────────────────────────┬────────────────────────────────┘
                              │ (uses store actions/state)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Pinia stores (src/stores/*.ts)                               │
│   - sessionStore, beatStore, authStore                       │
│   - Imports allowed: @/services/api (canonical surface only) │
│   - Imports forbidden: @/api/**, @/services/mockApiService,  │
│     @/services/demoApiClients                                │
└─────────────────────────────┬────────────────────────────────┘
                              │ (calls typed contract methods)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ Canonical_API_Surface  (src/services/api/index.ts)           │
│   - Public exports: sessionsApi, beatsApi, authApi,          │
│     storageApi, resetMockBackend, isDemoMode                 │
│   - Reads import.meta.env.VITE_DEMO_MODE at module load,     │
│     selects mock or real implementation, returns it          │
│     behind interface contracts from ./contracts.ts           │
└──────┬───────────────────────────────────────┬───────────────┘
       │ (demo path)                            │ (real path)
       ▼                                        ▼
┌────────────────────────────┐      ┌──────────────────────────┐
│ src/services/api/mock.ts   │      │ src/services/api/real.ts │
│   - wraps mockApiService   │      │   - wraps api-clients.ts │
│   - exports MockStorage    │      │   - wraps s3Service.ts   │
│     reset hook             │      │     and auth flows       │
└────────────────────────────┘      └──────────────────────────┘
```

Three boundaries the design protects:

1. **Views never reach across stores.** The only outbound dependency a view has into the data layer is `useSessionStore()`, `useBeatStore()`, or `useAuthStore()`.
2. **Stores never know about demo vs real.** They import from `@/services/api` exactly the way the codebase will after the migration — a single import path that returns objects matching a typed contract.
3. **The mock-vs-real switch lives in one file.** `src/services/api/index.ts` is the only module that reads `VITE_DEMO_MODE`. Everything else stays decoupled.

### Why a synchronous factory, not top-level `await import()`

The current `src/services/demoApiClients.ts` uses top-level `await import('@/api/api-clients')` to choose the real client. That works in modern bundlers but has two problems: it forces every consuming module into the async-module graph (subtle ESM hoisting and ordering issues, especially with Vitest's worker-based execution), and it pulls the entire AWS SDK into the demo bundle on cold start because Vite still has to evaluate the import-graph eagerly in dev mode for HMR boundaries.

The new design uses a **synchronous static-import + runtime-dispatch** pattern. Both `mock.ts` and `real.ts` are statically imported by `index.ts`. At module evaluation time, `index.ts` reads `VITE_DEMO_MODE` and exports the appropriate object. Tree-shaking handles unused branches in production builds (Vite/Rollup will drop the unselected branch when `VITE_DEMO_MODE` is statically replaced via `define`). For tests, both branches are present and selectable via `vi.stubEnv()`.

If the AWS-SDK bundle weight becomes a real concern in production (it might, for `real.ts` and `s3Service.ts`), we can revisit with a **lazy factory** — exporting a `getSessionsApi()` async function that resolves on first call. We are not solving that here; it is a future optimization, not a stabilization requirement.

## Components and Interfaces

### File layout

```
src/
  services/
    api/
      index.ts          # Canonical_API_Surface — public exports + selection
      contracts.ts      # TypeScript interface contracts (single source of truth)
      types.ts          # Domain types (SessionSummary, BeatSummary, etc.)
      mock.ts           # Mock implementation, satisfies contracts
      real.ts           # Real implementation, satisfies contracts
      reset.ts          # resetMockBackend() — exports the Reset_Action
    mockApiService.ts   # KEPT — backing in-memory store (now imported only by mock.ts)
                        # Modified: MockStorage gets a reset() method, demoHelpers.resetDemo
                        # is removed (replaced by resetMockBackend in api/reset.ts)
    s3Service.ts        # KEPT — wrapped by real.ts only
    api.ts              # DELETED — dead code (only used in legacy paths)
    sessionApi.ts       # DELETED — dead code (uses removed Amplify v5 API)
    demoApiClients.ts   # DELETED at end of migration (Phase 4)

  api/
    api-clients.ts      # KEPT — imported only by services/api/real.ts
    auth-interceptor.ts # KEPT — imported by api-clients.ts and authStore (real path)
    open-api/
      session-client/
        index.ts        # REPLACED — types only, no throwing classes
      beat-client/
        index.ts        # REPLACED — types only, no throwing classes

  stores/               # No file moves; imports change
  views/                # No file moves; imports change

tests/
  unit/                 # not used; unit tests colocate as src/**/*.test.ts
  integration/
    layering.test.ts            # AST scan (Req 3.5)
    canonical-surface.test.ts   # Contract conformance + env routing (Req 4.5, 4.6)
    stub-references.test.ts     # No imports from deleted stub paths (Req 2.3)
  e2e/
    smoke.spec.ts               # Playwright Smoke_Test (Req 5)
  fixtures/
    createMockApi.ts            # Per-test mock backend factory
    pinia.ts                    # Testing-Pinia setup helper
```

### Public surface — `src/services/api/contracts.ts`

The contract file is the single source of truth for what a "session API" or "beats API" looks like. Both `mock.ts` and `real.ts` declare `satisfies` against these interfaces, which makes the Vitest contract-conformance test (Req 4.5–4.6) trivial: it just imports both implementations and asserts the methods exist with the right shape.

```ts
// src/services/api/contracts.ts
import type {
  SessionSummary,
  GetSessionResponseContent,
  CreateSessionRequestContent,
  UpdateSessionRequestContent,
} from './types'
import type {
  BeatSummary,
  CreateBeatRequestContent,
} from './types'

export interface SessionsApiContract {
  listSessions(): Promise<{ data: { sessions: SessionSummary[] } }>
  getSession(id: string): Promise<{ data: GetSessionResponseContent }>
  createSession(payload: CreateSessionRequestContent): Promise<{ data: GetSessionResponseContent }>
  updateSession(id: string, payload: UpdateSessionRequestContent): Promise<{ data: GetSessionResponseContent }>
  deleteSession(id: string): Promise<{ data: { success: boolean } }>
}

export interface BeatsApiContract {
  listBeats(): Promise<{ data: { beats: BeatSummary[] } }>
  createBeat(payload: CreateBeatRequestContent): Promise<{ data: BeatSummary }>
  deleteBeat(id: string): Promise<{ data: { success: boolean } }>
}

export interface AuthApiContract {
  getCurrentUser(): Promise<AuthUser>
  isAuthenticated(): Promise<boolean>
  login(username: string, password: string): Promise<{ success: boolean; user?: AuthUser }>
  logout(): Promise<{ success: boolean }>
}

export interface StorageApiContract {
  uploadSessionScript(sessionId: string, scriptData: unknown): Promise<string>
  downloadSessionScript(sessionId: string): Promise<unknown>
  uploadArtwork(sessionId: string, file: File): Promise<string>
  uploadBeat(beatId: string, file: File): Promise<string>
}

export interface AuthUser {
  username: string
  email?: string
  sub: string
  name?: string
  [key: string]: unknown
}
```

### Selection logic — `src/services/api/index.ts`

```ts
// src/services/api/index.ts
import * as mock from './mock'
import * as real from './real'
import type {
  SessionsApiContract,
  BeatsApiContract,
  AuthApiContract,
  StorageApiContract,
} from './contracts'

/**
 * Reads VITE_DEMO_MODE and resolves to a boolean.
 * Default is `true` (demo) when the variable is unset, empty, or anything
 * other than the literal string "false". This satisfies Req 10.1–10.3:
 *   - unset/empty  -> demo
 *   - "true"       -> demo
 *   - "false"      -> real
 *   - any other    -> real (treated as opt-in to real mode)
 *
 * Exported for testing (vi.stubEnv()-driven assertions).
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

export { resetMockBackend } from './reset'
export type * from './contracts'
export type * from './types'
```

Note the precedence rule encoded above is one specific reading of Req 10.3 ("any value other than 'true' selects Real_Mode"). The literal interpretation of Req 10.3 says any non-"true" value picks real. We follow the literal wording: only `"true"` (case-sensitive) selects demo when the variable is set. Unset/empty defaults to demo per Req 10.1. This matches the existing `demoApiClients.ts` behavior and avoids surprising any developer who has `VITE_DEMO_MODE=false` set.

### Stores — minimal import change

Stores already use the right pattern conceptually (they import from `demoApiClients`). The migration is mechanical:

```ts
// Before
import { sessionsApi } from '@/services/demoApiClients'
import type { SessionSummary } from '@/api/open-api/session-client'

// After
import { sessionsApi } from '@/services/api'
import type { SessionSummary } from '@/services/api'
```

Type re-exports from `@/services/api` come from `types.ts`, so callers get one import path for both runtime and type imports.

`authStore.ts` currently has its own dynamic-import branching (`import('aws-amplify/auth')`, `import('@/api/auth-interceptor')`). After the migration, that branching moves into `src/services/api/real.ts`'s `authApi`, and `authStore` becomes a thin wrapper that calls `authApi.login(...)` etc. unconditionally.

### Views — minimal import change

Three views have illegal imports today:

| View | Current illegal imports | Replacement |
|---|---|---|
| `SessionBrowserView.vue` | `@/api/api-clients` (sessionsApi), `@/api/open-api/session-client` (types) | `useSessionStore()` actions; types from `@/services/api` |
| `BeatBrowserView.vue` | `@/api/api-clients` (beatsApi), `@/api/open-api/beat-client` (types) | `useBeatStore()` actions; types from `@/services/api` |
| `AddBeatView.vue` | `@/api/api-clients` (beatsApi), `@/api/open-api/beat-client` (types) | `useBeatStore().createBeat(...)`; types from `@/services/api` |
| `SessionEditorView.vue` | `@/services/demoApiClients` (sessionsApi, beatsApi), `@/services/mockApiService` (mockS3Service), `@/api/open-api/*` (types) | `useSessionStore()` for session ops, `useBeatStore()` for beats list; **`storageApi` from `@/services/api`** for script upload/download (the editor is the one place that legitimately needs storage; this is acceptable because the canonical surface is now the only API entry — the layering rule forbids `@/api/**` and `@/services/demoApiClients` from views, but the editor will get storage access through a future creative-core-loop refactor that puts script upload behind the store) |

**SessionEditorView storage exception:** the editor calls `mockS3Service` directly today. To honor the layering invariant strictly (Req 3.1, 3.2: stores are the *only* callers of the canonical surface), we add a `saveScript(sessionId, delta)` action to `sessionStore` that internally calls `storageApi.uploadSessionScript(...)` followed by `sessionsApi.updateSession(...)`. The view calls `sessionStore.saveScript(...)` and never imports `storageApi` directly. This is a small but real refactor and is in scope for this spec because Req 3.5 will fail otherwise.

The autosave timer logic (the `setInterval(..., 10000)` block) stays in the view for now. Moving it to a state machine is **creative-core-loop** territory and is explicitly out of scope here.

## Data Models

No new persistent data models. The design preserves the existing shapes:

- `SessionSummary`, `GetSessionResponseContent`, `CreateSessionRequestContent`, `UpdateSessionRequestContent` (from the old `@/api/open-api/session-client/index.ts`)
- `BeatSummary`, `ListBeatsResponseContent`, `CreateBeatRequestContent` (from the old `@/api/open-api/beat-client/index.ts`)
- `AuthUser` (from `authStore.ts`)

These types move to `src/services/api/types.ts` verbatim. The old stub files at `src/api/open-api/{session,beat}-client/index.ts` are replaced with type-only re-exports during migration so existing import paths keep working until Phase 4, and are then deleted (see Migration Plan).

## Error Handling

Stores already implement a per-store error/success message pattern (`error`, `successMessage`, `setError`, `setSuccess`, `clearMessages`). The design preserves that. The canonical surface throws normal `Error` (from the mock) or `AxiosError` (from the real path); stores catch and translate to user-readable messages.

The design adds two new error-handling concerns:

1. **`resetMockBackend()` failures.** Reset must be reentrant and must not leave Pinia stores in a half-loaded state. Implementation: reseed `MockStorage` first (synchronous), then `Promise.all([fetchSessions(), fetchBeats()])` for refresh. If any refresh rejects, surface the failure via `sessionStore.setError` / `beatStore.setError` and re-throw so the DemoBanner can show "Reset failed" briefly.

2. **`console.error` budget.** The smoke test enforces zero `console.error` calls during boot (Req 8.1, 8.3). The current codebase has multiple sources of `console.error` even on a clean boot:
   - The throwing stub clients log `Error: Use demoApiClients instead` when something accidentally imports `@/api/api-clients` in demo mode → eliminated by the canonical surface.
   - `Auth status check failed` in `authStore.checkAuthStatus()` when the demo `mockAuthService` rejects → fix: in demo mode, `mockAuthService.isAuthenticated()` already returns `true`, so this only fires if there's a real bug. Keep the log but downgrade to `console.warn`. (Also: stores log `console.error` on user-facing errors — those are acceptable in normal flow but must NOT fire on boot. The smoke-test budget is "zero errors before sessions list completes first render," which is a clean-state path.)

## Testing Strategy

This spec is fundamentally about static analysis, configuration, and a single end-to-end smoke flow. Property-based testing does **not** apply: every requirement is configuration validation, AST scanning, lint configuration, package-script wiring, env-default behavior, or single-shot smoke. There is no input space across which a `for-all` would catch more bugs than a few well-chosen examples. Per the workflow's own guidance, we use example-based unit tests, an AST scan, contract-conformance tests, and a Playwright smoke instead.

### Vitest harness (Requirement 4)

**Config — `vitest.config.ts`:**

```ts
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
    include: ['src/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
})
```

**Setup — `tests/setup.ts`:** initializes a fresh Pinia per test via `@pinia/testing`, and a per-test `MockStorage` reset by importing `resetMockBackend` and calling it in `beforeEach`.

**New devDependencies:**

```
vitest @vitest/coverage-v8 @pinia/testing @vue/test-utils jsdom vue-tsc
@typescript-eslint/parser eslint-plugin-import
@playwright/test
```

(`@typescript-eslint/parser` and `eslint-plugin-import` are needed for the layering ESLint rules; the existing `.eslintrc.js` is missing both.)

**Test layout:**

```
src/
  stores/
    sessionStore.ts
    sessionStore.test.ts          # Req 4.2 — list, get, create, update, delete
    beatStore.ts
    beatStore.test.ts             # Req 4.3 — list, create, delete (matches actual store surface)
    authStore.ts
    authStore.test.ts             # Req 4.4 — login, logout, checkAuthStatus in demo mode
  services/
    api/
      index.ts
      index.test.ts               # Req 4.5, 4.6 — env routing
      reset.ts
      reset.test.ts               # Req 7.5 determinism
tests/
  integration/
    layering.test.ts              # Req 3.5
    canonical-surface.test.ts     # Req 4.5, 4.6 contract conformance
    stub-references.test.ts       # Req 2.3
  fixtures/
    createMockApi.ts
    pinia.ts
```

**Per-test fixture — `tests/fixtures/createMockApi.ts`:**

```ts
import { resetMockBackend } from '@/services/api'

export async function freshMock() {
  await resetMockBackend()
}
```

Each store test calls `freshMock()` in `beforeEach` so no test leaks state into another. This is critical for Req 7.5 (determinism after reset) and for Req 4.2's `create` + `delete` tests not interfering.

**Layering AST scan — `tests/integration/layering.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { glob } from 'glob'

const FORBIDDEN_FROM_VIEWS = [
  /from\s+['"]@\/api\//,
  /from\s+['"]@\/services\/api(\/|['"])/,
  /from\s+['"]@\/services\/demoApiClients['"]/,
  /from\s+['"]@\/services\/mockApiService['"]/,
  /from\s+['"]@\/services\/s3Service['"]/,
]

describe('layering invariant', () => {
  it('no view imports the API or service layer directly (Req 3.5)', async () => {
    const viewFiles = await glob('src/views/**/*.vue')
    const violations: { file: string; pattern: string }[] = []
    for (const file of viewFiles) {
      const content = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN_FROM_VIEWS) {
        if (pattern.test(content)) violations.push({ file, pattern: String(pattern) })
      }
    }
    expect(violations).toEqual([])
  })
})
```

A regex scan is sufficient here. Vue SFC parsing is overkill for a one-time invariant check, and the ESLint rule already provides AST-grade enforcement during development; this test is the belt-and-suspenders defense. If the regex scan ever produces a false negative, the ESLint rule catches it in CI.

**Stub-reference scan — `tests/integration/stub-references.test.ts`:** identical pattern but scoped to all `src/**/*.{ts,vue}` files, asserting nothing imports from `@/api/open-api/session-client` or `@/api/open-api/beat-client` after the type files have been moved (Req 2.3).

Note on timing: the stub paths host the *types* until Phase 4 of migration. The stub-reference test only fails at and after Phase 4, when types have moved to `@/services/api/types.ts`. The test is committed in Phase 5 alongside the deletion to enforce "stays gone."

**Contract conformance — `tests/integration/canonical-surface.test.ts`:**

```ts
import { describe, expect, it, vi } from 'vitest'

describe('Canonical_API_Surface routing (Req 4.5, 4.6)', () => {
  it('returns mock implementation when VITE_DEMO_MODE is "true"', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.resetModules()
    const api = await import('@/services/api')
    expect(api.isDemoMode).toBe(true)
    // mock returns at least one seeded session
    const res = await api.sessionsApi.listSessions()
    expect(res.data.sessions.length).toBeGreaterThan(0)
  })

  it('returns real implementation when VITE_DEMO_MODE is "false"', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false')
    vi.resetModules()
    const api = await import('@/services/api')
    expect(api.isDemoMode).toBe(false)
    // real impl is constructed from api-clients.ts; assert by structural identity
    const real = await import('@/services/api/real')
    expect(api.sessionsApi).toBe(real.sessionsApi)
  })

  it('defaults to demo when VITE_DEMO_MODE is unset', async () => {
    vi.stubEnv('VITE_DEMO_MODE', '')
    vi.resetModules()
    const api = await import('@/services/api')
    expect(api.isDemoMode).toBe(true)
  })

  it('mock and real both satisfy SessionsApiContract', async () => {
    const mock = await import('@/services/api/mock')
    const real = await import('@/services/api/real')
    const methods = ['listSessions', 'getSession', 'createSession', 'updateSession', 'deleteSession']
    for (const m of methods) {
      expect(typeof mock.sessionsApi[m]).toBe('function')
      expect(typeof real.sessionsApi[m]).toBe('function')
    }
  })
})
```

`vi.resetModules()` is necessary because `index.ts` evaluates the env at module load and caches the result.

**ESLint self-test:** `tests/integration/eslint-rules.test.ts` runs `ESLint.lintText(source)` against a known-bad fixture (`import { sessionsApi } from '@/api/api-clients'` inside a fake view) and asserts the rule fires. This protects the lint config from silent regression (a glob typo in `.eslintrc.js` overrides could otherwise let violations through).

### Playwright harness (Requirement 5)

**Config — `playwright.config.ts`:**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: { VITE_DEMO_MODE: 'true' },
  },
})
```

`webServer.timeout: 60_000` mitigates Vite cold-start flakiness. `reuseExistingServer` lets a developer leave `npm run dev` running and have `npm run test:e2e` reuse it.

**Smoke test — `tests/e2e/smoke.spec.ts`:**

```ts
import { test, expect } from '@playwright/test'

test('boots clean, renders sessions, opens editor, autosaves (Req 5, Req 8)', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: Error[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (err) => pageErrors.push(err))

  await page.goto('/sessions')                                        // Req 5.2
  const firstCard = page.locator('[data-testid="session-card"]').first()
  await expect(firstCard).toBeVisible({ timeout: 10_000 })             // Req 5.3

  await firstCard.click()
  await expect(page.locator('[data-testid="script-editor"]'))          // Req 5.4
    .toBeVisible({ timeout: 10_000 })

  await page.locator('[data-testid="script-editor"] .ql-editor').click()
  await page.keyboard.type('a')                                        // Req 5.5
  await expect(page.locator('[data-testid="autosave-status"]'))
    .toHaveText(/saved/i, { timeout: 15_000 })

  expect(consoleErrors, `console.error during smoke: ${consoleErrors.join('\n')}`).toEqual([])  // Req 8.3, 5.6
  expect(pageErrors, `unhandled rejection during smoke: ${pageErrors.map(String).join('\n')}`).toEqual([])  // Req 5.7
})
```

`data-testid` attributes are added during the migration to:
- Each session card in `SessionBrowserView` → `data-testid="session-card"`
- The Quill mount point in `SessionEditorView` → `data-testid="script-editor"`
- The save-status `<p>` in `SessionEditorView` → `data-testid="autosave-status"`

The 15-second autosave bound is intentional. Current autosave fires on a 10-second `setInterval`; 15 seconds gives a 50% buffer. **creative-core-loop** will replace the timer with a debounce-based state machine and tighten this bound — that work is explicitly out of scope here.

### Why no PBT here

To make this explicit in the design (per the workflow): every acceptance criterion in `requirements.md` is one of:

- **lint configuration** (Req 1.4–1.6, 3.3–3.4) — verified by ESLint config + a self-test fixture
- **AST/source scan** (Req 2.3, 3.5) — verified by a regex scan over the source tree
- **test-harness configuration** (Req 4.1–4.6, 5.1) — verified by the harness existing and exiting non-zero on failure
- **single E2E flow** (Req 5.2–5.7, 8.3) — one happy-path smoke
- **package script presence** (Req 6, Req 9.1–9.2) — verified by reading `package.json`
- **environment defaulting** (Req 10.1–10.3) — three example tests
- **DemoBanner DOM rendering** (Req 7.1–7.6) — Vue Test Utils render assertions

There is no `for-all valid input X, P(X) holds` shape here. PBT would not catch additional bugs. We use example-based tests + the AST scan + the smoke and document the rationale to keep future contributors from "adding properties" to a spec that doesn't need them.

## Stub Module Elimination Strategy (Requirement 2)

**Decision:** Keep the *types*. Delete the *throwing classes*.

The types (`SessionSummary`, `GetSessionResponseContent`, `BeatSummary`, etc.) are imported across stores and views. The throwing classes (`DefaultSessionsApi`, `DefaultBeatsApi`, `Configuration`) are imported only by `src/api/api-clients.ts`, which constructs them and never calls a method on them in demo mode (so the throws never fire today). In real mode, they would fire — but real mode is not exercised yet.

**Approach:**

1. Move the type definitions into `src/services/api/types.ts` verbatim. This becomes the single source of truth.
2. Replace `src/api/open-api/session-client/index.ts` with a single line: `export type * from '@/services/api/types'`. Same for `beat-client`. This keeps existing imports working during Phase 1–3 of migration.
3. After all stores and views have been migrated to import types from `@/services/api`, delete both stub files entirely (Phase 4).
4. Update `src/api/api-clients.ts` to either (a) be deleted if real mode is not exercised, or (b) use freshly-generated OpenAPI clients when real mode is needed. **For this spec, (a) is the choice**: `api-clients.ts` keeps its current implementation, but the throwing client classes it constructs (`DefaultSessionsApi`, etc.) are replaced with hand-authored thin axios wrappers in `src/services/api/real.ts`. The OpenAPI generation pipeline is reactivated in a future spec when real-mode goes live.

The stub-reference Vitest test (Req 2.3) is committed simultaneously with Phase 5 deletion. Until then, the test would fail trivially because the types still live there.

## Layering Enforcement (Requirement 3)

### ESLint configuration

Replace the current `.eslintrc.js` with a config that supports per-path overrides via `eslint-plugin-import`. Key rules:

```js
// .eslintrc.js (post-migration)
module.exports = {
  root: true,
  env: { node: true, browser: true },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-essential',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  rules: {
    'prettier/prettier': 'error',
    'vue/multi-word-component-names': 'off',
    // Globally forbid the legacy paths from anywhere in src/
    'no-restricted-imports': ['error', {
      paths: [
        { name: '@/services/demoApiClients', message: 'Use @/services/api instead.' },
      ],
      patterns: [
        // (none — global; per-path constraints handled via overrides)
      ],
    }],
  },
  overrides: [
    {
      // Views may not import from the API or service layer at all (Req 1.4–1.5, 3.3–3.4)
      files: ['src/views/**/*.vue'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['@/api/*', '@/api/**'],          message: 'Views must go through Pinia stores. Forbidden by Req 3.4.' },
            { group: ['@/services/api',  '@/services/api/*', '@/services/api/**'],
                                                       message: 'Views must go through Pinia stores. Forbidden by Req 3.3.' },
            { group: ['@/services/demoApiClients'],    message: 'Use a Pinia store instead.' },
            { group: ['@/services/mockApiService'],    message: 'Views must not import the mock backend directly.' },
            { group: ['@/services/s3Service'],         message: 'Views must not import S3 directly. Use a store action.' },
          ],
        }],
      },
    },
    {
      // Stores may go through @/services/api ONLY (Req 1.3, 3.2)
      files: ['src/stores/**/*.ts'],
      rules: {
        'no-restricted-imports': ['error', {
          patterns: [
            { group: ['@/api/*', '@/api/**'],          message: 'Stores must use @/services/api, not @/api/* directly. Forbidden by Req 3.2.' },
            { group: ['@/services/demoApiClients'],    message: 'Use @/services/api instead.' },
            { group: ['@/services/mockApiService'],    message: 'Use @/services/api instead.' },
          ],
        }],
      },
    },
  ],
}
```

The `vue-eslint-parser` is required so `<script setup lang="ts">` blocks in `.vue` files are parsed correctly. It is added as a devDependency.

### Migration table (per-view delta)

| File | Before | After |
|---|---|---|
| `SessionBrowserView.vue` | `import { sessionsApi } from '@/api/api-clients'` | Remove. Use `useSessionStore()` actions: `store.fetchSessions()`, `store.loadSession(id)`. |
| `SessionBrowserView.vue` | `import type { SessionSummary } from '@/api/open-api/session-client'` | `import type { SessionSummary } from '@/services/api'` |
| `BeatBrowserView.vue` | `import { beatsApi } from '@/api/api-clients'` | Remove. Use `useBeatStore()` actions: `store.fetchBeats()`, `store.createBeat(payload)`. |
| `BeatBrowserView.vue` | `import type { CreateBeatRequestContent } from '@/api/open-api/beat-client'` | `import type { CreateBeatRequestContent } from '@/services/api'` |
| `AddBeatView.vue` | `import { beatsApi } from '@/api/api-clients'` | Remove. Use `useBeatStore().createBeat(payload)`. |
| `AddBeatView.vue` | `import type { CreateBeatRequestContent } from '@/api/open-api/beat-client'` | `import type { CreateBeatRequestContent } from '@/services/api'` |
| `SessionEditorView.vue` | `import { beatsApi, sessionsApi } from '@/services/demoApiClients'` | Remove. Use `useSessionStore()`, `useBeatStore()`. |
| `SessionEditorView.vue` | `import { mockS3Service } from '@/services/mockApiService'` | Remove. Add `sessionStore.saveScript(id, delta)` action; view calls that. |
| `SessionEditorView.vue` | `import type { ... } from '@/api/open-api/session-client'` | `import type { ... } from '@/services/api'` |
| `SessionEditorView.vue` | `await import('@/services/s3Service')` (real-mode branch) | Remove the conditional entirely; the store action is the single integration point. |

### Belt-and-suspenders

The Vitest layering test (`tests/integration/layering.test.ts`) duplicates the lint check at the test level. This protects against:
- A developer running `npm run dev` with `--no-lint` or with the IDE's ESLint integration disabled.
- A future change to `.eslintrc.js` that accidentally narrows the override globs.
- Lint warnings being downgraded to non-blocking somewhere upstream.

## Demo-Mode Signaling and Reset (Requirement 7)

### Banner copy

The DemoBanner currently displays `🎭 Demo Mode - Using mock data for demonstration`. Replace with the exact text from Req 7.1:

```
DEMO MODE — credentials are not real, data resets on reload
```

Keep it as the prominent header text. The decorative emoji and "Show Info" panel can stay; they don't conflict with the requirement. Remove the close button — it persists `hideDemoBanner` to localStorage, which means a developer can hide the demo signal and forget they're in demo mode. That defeats Req 7.1.

### `Reset_Action` implementation

```ts
// src/services/api/reset.ts
import { useSessionStore } from '@/stores/sessionStore'
import { useBeatStore } from '@/stores/beatStore'
import { __resetMockStorage } from './mock'   // internal hook exported by mock.ts only

export async function resetMockBackend(): Promise<void> {
  __resetMockStorage()
  const sessionStore = useSessionStore()
  const beatStore = useBeatStore()
  await Promise.all([sessionStore.fetchSessions(), beatStore.fetchBeats()])
}
```

```ts
// src/services/api/mock.ts (excerpt)
import { MockStorage, mockSessionsApi, mockBeatsApi, ... } from '@/services/mockApiService'

let storage = new MockStorage()
export function __resetMockStorage() {
  storage = new MockStorage()   // fresh seed
  // re-bind exported APIs to point at the new storage instance
  ...
}
```

To make `__resetMockStorage()` work, `MockStorage` is refactored from a module-private singleton to a swappable instance, and the exported `mockSessionsApi` / `mockBeatsApi` become thin shims that delegate to the *current* storage. This is a small change to `mockApiService.ts`:

```ts
// In mockApiService.ts (changed)
export class MockStorage { ... /* same as today, but exported */ }

let _storage = new MockStorage()
export function __setMockStorage(s: MockStorage) { _storage = s }
export function __resetMockStorage() { _storage = new MockStorage() }

export const mockSessionsApi = {
  listSessions: () => _storage.getSessions(),
  // ... etc, all delegated through _storage
}
```

The double-underscore prefix signals "internal escape hatch" and the ESLint rule above forbids importing it from views/stores. Only `src/services/api/reset.ts` and `src/services/api/mock.ts` are allowed callers.

### Banner button wiring

```vue
<button
  @click="onReset"
  :disabled="isResetting"
  data-testid="reset-demo-data"
>
  {{ isResetting ? 'Resetting…' : 'Reset demo data' }}
</button>

<script setup lang="ts">
import { ref } from 'vue'
import { resetMockBackend } from '@/services/api'

const isResetting = ref(false)
async function onReset() {
  isResetting.value = true
  try { await resetMockBackend() }
  finally { isResetting.value = false }
}
</script>
```

No `window.location.reload()`. No `confirm()` dialog (the Req says nothing about confirmation, and a confirm prompt fires `pageerror` listeners in some Playwright configurations). The `demoHelpers.resetDemo` helper in `mockApiService.ts` is deleted.

### Determinism

Req 7.5 says two consecutive resets must produce identical observable state. This holds because `MockStorage`'s constructor uses deterministic seed data: `[...mockSessions, ...generateMoreSessions(7)]`. As long as `generateMoreSessions(7)` is itself deterministic (it currently uses `Math.random()` for ID and dates — needs review), the property holds.

**Action item:** audit `generateMoreSessions` in `src/data/mockData.ts`. If it uses any source of nondeterminism (`Math.random()`, `Date.now()`), replace with a fixed seed function or static data. The Vitest test `src/services/api/reset.test.ts` asserts:

```ts
it('resetMockBackend produces identical state on consecutive calls (Req 7.5)', async () => {
  await resetMockBackend()
  const a = await sessionsApi.listSessions()
  await resetMockBackend()
  const b = await sessionsApi.listSessions()
  expect(b).toEqual(a)
})
```

If this test fails, the fix is in `mockData.ts`, not in the reset code.

## Clean-Console Invariant (Requirement 8)

### Audit

Sources of `console.error` on a clean demo boot today, with the canonical surface in place:

| Source | After migration |
|---|---|
| Stub clients throwing `Use demoApiClients instead` | **Gone** — stubs are deleted; canonical surface routes correctly. |
| `authStore.checkAuthStatus` catch block logging `Auth status check failed` | Demo path doesn't throw — `mockAuthService.isAuthenticated()` returns `true`. Real-mode boot might still log; downgrade to `console.warn` for the real path. |
| Store error handlers (`Session Store Error: ...`) | Only fire on actual API errors, which don't happen on a clean demo boot. Acceptable. |
| `Failed to load script` warning in editor | Already a `console.warn`, not `console.error`. Acceptable. |

### Smoke-test enforcement

The Playwright `consoleErrors` array (see Smoke Test above) enforces the zero-error budget for the duration of the test, including initial boot, navigation to `/sessions`, click into the editor, and the first autosave cycle. If a future change introduces a new `console.error` call, the smoke test fails.

## CI-Friendly Scripts (Requirement 9)

### Final `package.json` scripts block

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "lint": "eslint --ext .ts,.vue src/ tests/",
  "format": "prettier --write \"**/*.{js,ts,json,vue,md}\"",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "typecheck": "vue-tsc --noEmit"
}
```

The legacy `serve`, `generate:api`, and `clean` scripts are removed (`serve` calls the long-since-replaced `vue-cli-service`; `generate:api` is a no-op `echo`; `clean` is footgun-shaped).

### README documentation

Add a `## Scripts` section to `fluxury-app/README.md`:

```
- `npm run dev` — start the Vite dev server on http://localhost:5173
- `npm run build` — build the production bundle into `dist/`
- `npm run preview` — preview the production bundle locally
- `npm run lint` — run ESLint over `src/` and `tests/`. Fails CI on any violation.
- `npm run format` — run Prettier in write mode over the workspace.
- `npm test` — run the Vitest unit + integration suite once. Fails CI on any failure.
- `npm run test:watch` — run Vitest in watch mode for development.
- `npm run test:e2e` — boot the dev server and run the Playwright smoke test. Fails CI on any failure.
- `npm run typecheck` — run `vue-tsc --noEmit` to surface type errors. Fails CI on any error.
```

All four CI-relevant scripts (`test`, `test:e2e`, `typecheck`, `lint`) inherit non-zero exit behavior from their underlying tools (Vitest, Playwright, vue-tsc, ESLint). No wrapper logic needed.

## Typecheck Script (Requirement 6)

Add `vue-tsc` as a devDependency. Use `"typecheck": "vue-tsc --noEmit"`. The existing `tsconfig.json` already includes `src/**/*.vue`, so vue-tsc will check SFC `<script>` blocks alongside TS files. No `tsconfig.json` changes are required for the script to work.

**Caveat:** the current codebase has not been typechecked end-to-end. Running `vue-tsc --noEmit` on the existing tree will likely surface latent errors. The Migration Plan addresses this with a time-boxed fix-or-suppress pass before wiring `typecheck` into CI.

## Environment Safety (Requirement 10)

The `resolveDemoMode(env)` function in `src/services/api/index.ts` is the single source of truth for the precedence rule:

```
VITE_DEMO_MODE  →  Mode
─────────────────────
undefined       →  Demo (Req 10.1)
""              →  Demo (Req 10.1)
"true"          →  Demo
"false"         →  Real (Req 10.3)
anything else   →  Real (Req 10.3 literal reading)
```

Three Vitest tests exercise these branches via `vi.stubEnv` (see Contract conformance test above).

A fresh checkout with no `.env.local` boots in demo mode because Vite's `import.meta.env.VITE_DEMO_MODE` is `undefined` in that case, and `resolveDemoMode(undefined)` returns `true` (Req 10.2).

## Migration / Rollout Plan

Five small, independently-shippable phases. Each phase ends with a green build, green tests, and a working app.

### Phase 1 — Add the canonical surface (additive only)

- Create `src/services/api/{contracts.ts,types.ts,mock.ts,real.ts,reset.ts,index.ts}`.
- `mock.ts` re-exports from the existing `mockApiService.ts` adapters.
- `real.ts` constructs axios-based wrappers using `auth-interceptor.ts` directly (skipping the throwing OpenAPI client classes).
- Existing `demoApiClients.ts` keeps working; nothing imports the new surface yet.
- Add `vitest.config.ts`, `tests/setup.ts`, devDependencies.
- **Success:** `npm run dev` works; `npm test` runs (zero tests is fine); the app behaves identically to before.
- **Commit:** "feat(api): add canonical API surface alongside legacy demoApiClients"

### Phase 2 — Migrate stores

- Change `sessionStore.ts`, `beatStore.ts`, `authStore.ts` to import from `@/services/api`.
- Replace authStore's inline demo-vs-real branching with calls to `authApi`.
- Add `sessionStore.saveScript(id, delta)` action.
- Add store-level Vitest tests (`*.test.ts` colocated).
- **Success:** all store tests green; manual smoke through the dev server still works.
- **Commit:** "refactor(stores): route through canonical API surface; add store tests"

### Phase 3 — Migrate views

- Apply the per-view migration table above.
- Add `data-testid` attributes for the smoke test.
- Replace DemoBanner copy and reset implementation.
- Add the layering Vitest test and the canonical-surface routing test.
- Add and configure ESLint rules.
- Run `npm run lint` and `npm test` until clean.
- **Success:** lint passes; layering test passes; manual smoke through the dev server still works; `console.error` budget is zero on boot.
- **Commit:** "refactor(views): route through stores; enforce layering invariant"

### Phase 4 — Delete the legacy paths

- Move types from `src/api/open-api/{session,beat}-client/index.ts` to `src/services/api/types.ts` (already done in Phase 1; confirm and delete the stubs).
- Delete `src/services/demoApiClients.ts`.
- Delete `src/services/api.ts` (dead).
- Delete `src/services/sessionApi.ts` (dead, uses removed Amplify v5 API).
- Replace `demoHelpers.resetDemo` with nothing; delete `demoHelpers` entirely if no other call sites.
- Add the stub-references Vitest test.
- Update `.env.local` and `.env.demo` if needed (no changes expected).
- **Success:** `npm run lint`, `npm test`, `npm run typecheck`, `npm run dev` all green. No file in `src/` references the deleted paths.
- **Commit:** "chore: delete legacy API paths and stub modules"

### Phase 5 — Add the Playwright smoke and finalize scripts

- Add `playwright.config.ts`, `tests/e2e/smoke.spec.ts`.
- Update `package.json` scripts block.
- Update `README.md` Scripts section.
- Run `npm run test:e2e` until green.
- **Success:** all five scripts (`lint`, `test`, `test:e2e`, `typecheck`, `format`) exit zero on a clean checkout.
- **Commit:** "test(e2e): add Playwright smoke; finalize CI scripts and README"

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Top-level `await import()` in current `demoApiClients.ts` is masking a race condition that only surfaces under Vitest's worker model. | Medium | The new design replaces it with synchronous static imports + runtime dispatch. Vitest's `vi.resetModules()` + `vi.stubEnv()` pattern is well-trodden. |
| `vue-tsc --noEmit` surfaces 50+ latent type errors on the first run. | High | Time-box a half-day fix-or-suppress pass during Phase 5. Suppressions use `// @ts-expect-error TODO(repo-stabilization): <reason>` with a tracking comment. CI does not gate on `typecheck` until the count is zero — but the script ships in Phase 5 so the next spec inherits a working baseline. |
| ESLint `no-restricted-imports` glob overrides match too eagerly or not at all. | Medium | The `eslint-rules.test.ts` self-test asserts a known-bad import triggers the rule. If the rule silently stops firing, that test fails. |
| Playwright `webServer` is flaky on cold start because Vite takes >30s to boot on a clean `node_modules`. | Medium | `webServer.timeout: 60_000`; `reuseExistingServer: !process.env.CI` so local dev reuses an already-running server. |
| `MockStorage` reset isn't actually deterministic because `generateMoreSessions(7)` uses `Math.random()`. | High | Audit `mockData.ts` in Phase 1; replace random sources with a fixed seed function. The `reset.test.ts` determinism test will fail loudly if this is missed. |
| The DemoBanner "X to close" affordance hides demo-mode signaling, breaking Req 7.1's "WHILE in Demo_Mode SHALL display." | Already in code today | Remove the close button and the `hideDemoBanner` localStorage logic in Phase 3. |
| Real-mode (`VITE_DEMO_MODE=false`) breaks because `real.ts` wraps `api-clients.ts` whose OpenAPI clients are stubs. | Medium | Real mode is not a Req-10 happy-path here (Req 10.3 only requires the *selection* to land on real, not that real boots cleanly). Document this in `real.ts` with a clear `// TODO(post-stabilization)` comment, and have the contract-conformance test assert structure only, not behavior. The next spec that touches real mode is responsible for finishing it. |

## Correctness Properties

This spec uses no property-based tests. Every acceptance criterion in `requirements.md` is a configuration check, lint/AST scan, render assertion, single-shot smoke check, or env-default behavior — there is no meaningful input space over which to quantify a `for-all` statement.

See the Testing Strategy section's "Why no PBT here" subsection for the full rationale, and the `## Correctness Invariants and Enforcement` table below for the binding mechanism this spec uses in place of PBT: 27 invariants, each mapped to a concrete enforcement (lint rule, AST scan, render assertion, smoke check, or env-driven unit test).

## Correctness Invariants and Enforcement

> Note: this section documents the invariants this spec must preserve, not property-based-test properties. PBT does not apply to this spec (see Testing Strategy). Each invariant maps to a static check, AST scan, lint rule, or smoke test that enforces it.

| # | Invariant | Source requirement | Enforcement mechanism |
|---|---|---|---|
| I1 | API surface uniqueness — exactly one module exports `sessionsApi`, `beatsApi`, `authApi`, `storageApi`. | Req 1.1 | File presence check in CI (`test -f src/services/api/index.ts`); contract-conformance test imports from one path only. |
| I2 | Demo-vs-real selection lives behind one module. | Req 1.2 | `tests/integration/canonical-surface.test.ts` asserts both modes route through the same import; ESLint rule forbids any other module from reading `VITE_DEMO_MODE` (added as a `no-restricted-syntax` rule). |
| I3 | Stores import only from `@/services/api`. | Req 1.3 | ESLint override on `src/stores/**/*.ts` forbids `@/api/**`, `@/services/demoApiClients`, `@/services/mockApiService`. |
| I4 | Views never import from the API or service layer. | Req 1.4, 1.5, 3.3, 3.4 | ESLint override on `src/views/**/*.vue` + `tests/integration/layering.test.ts` AST scan. |
| I5 | `npm run lint` exits non-zero on any violation. | Req 1.6, 9.2 | Inherent to ESLint CLI; `tests/integration/eslint-rules.test.ts` self-test confirms the rules fire. |
| I6 | Zero stub modules under `src/api/open-api/`. | Req 2.1 | Files deleted in Phase 4; CI directory-listing check (`find src/api/open-api -type f` returns empty). |
| I7 | OpenAPI types come from a working module, not a stub. | Req 2.2 | Types relocated to `src/services/api/types.ts`; `npm run typecheck` confirms imports resolve. |
| I8 | No source file references the deleted stub paths. | Req 2.3 | `tests/integration/stub-references.test.ts` regex-scans all `src/**/*.{ts,vue}`. |
| I9 | Pinia stores are the only callers of the canonical surface. | Req 3.1, 3.2 | ESLint global rule forbids `@/services/api` from `src/views/**/*.vue` and from anywhere outside `src/stores/**` (a third override on the `outside-stores-and-services` glob). |
| I10 | Layering invariant holds at the source-tree level. | Req 3.5 | `tests/integration/layering.test.ts`. |
| I11 | `npm test` runs Vitest, exits 0 on success and non-zero on failure. | Req 4.1, 9.2 | Inherent to Vitest CLI. |
| I12 | Store coverage exists for sessions, beats, auth (in demo mode). | Req 4.2, 4.3, 4.4 | Three colocated test files: `sessionStore.test.ts`, `beatStore.test.ts`, `authStore.test.ts`. |
| I13 | Canonical surface returns the mock impl iff `VITE_DEMO_MODE === "true"` (and unset → demo). | Req 4.5, 10.1 | Three `vi.stubEnv`-driven tests in `canonical-surface.test.ts`. |
| I14 | Canonical surface returns the real impl when `VITE_DEMO_MODE` is absent or any non-`"true"` value... wait: per Req 10 the unset case returns demo. So: surface returns real iff `VITE_DEMO_MODE` is set and not equal to `"true"`. | Req 4.6, 10.3 | Same test file, separate cases. |
| I15 | `npm run test:e2e` runs the smoke against a served instance and exits non-zero on failure. | Req 5.1, 9.2 | Inherent to Playwright CLI; `webServer` block boots the dev server. |
| I16 | Smoke navigates `/sessions`, asserts at least one session card, opens the editor, types, and waits for "saved." | Req 5.2–5.5 | `tests/e2e/smoke.spec.ts`. |
| I17 | Smoke fails on any `console.error` or unhandled rejection. | Req 5.6, 5.7, 8.3 | `consoleErrors`/`pageErrors` arrays asserted empty at end. |
| I18 | `npm run typecheck` defined and exits non-zero on any type error. | Req 6.1–6.3, 9.2 | `"typecheck": "vue-tsc --noEmit"` inherits non-zero from vue-tsc. |
| I19 | DemoBanner copy matches Req 7.1 exactly. | Req 7.1 | Vue Test Utils render assertion in `DemoBanner.test.ts`: `expect(wrapper.text()).toContain('DEMO MODE — credentials are not real, data resets on reload')`. |
| I20 | DemoBanner shows the "Reset demo data" control in demo mode. | Req 7.2 | Render assertion: `wrapper.find('[data-testid="reset-demo-data"]').exists()`. |
| I21 | DemoBanner is absent in real mode. | Req 7.3 | Render assertion with `vi.stubEnv('VITE_DEMO_MODE', 'false')`: `expect(wrapper.html()).toBe('<!---->')`. |
| I22 | `Reset_Action` reseeds and refreshes without `window.location.reload()`. | Req 7.4 | Static check via grep in CI (`! grep -r 'window.location.reload' src/`); plus the `reset.test.ts` calls reset and asserts stores re-fetch. |
| I23 | Reset is deterministic — two calls produce identical state. | Req 7.5 | `reset.test.ts` `expect(b).toEqual(a)` after two consecutive resets. |
| I24 | Console is clean on first paint at `/sessions`. | Req 8.1, 8.2 | Smoke test (I17 covers it). |
| I25 | `package.json` defines all four CI scripts. | Req 9.1 | Static check: a Vitest test that reads `package.json` and asserts each key exists. |
| I26 | README documents each script. | Req 9.3 | Manual review during PR; static check that README contains each script name (a Vitest test that reads `README.md`). |
| I27 | Boot succeeds without `.env.local`. | Req 10.2 | Manual verification step in Migration Plan Phase 5; the `resolveDemoMode(undefined) === true` unit test covers the underlying logic. |
