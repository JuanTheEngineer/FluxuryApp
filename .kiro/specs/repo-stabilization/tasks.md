# Implementation Plan: repo-stabilization

## Overview

This is a five-phase technical-debt repayment that introduces a single canonical API surface (`@/services/api`), enforces a layering invariant via ESLint + Vitest AST scans, stands up a Vitest unit/integration harness and a Playwright smoke, and finalizes the four CI-friendly scripts (`lint`, `test`, `test:e2e`, `typecheck`).

Each phase is independently shippable: it ends with a green build, green tests, and a working dev server. CI/CD setup, real-mode wiring, design-system work, and autosave/state-machine work are all out of scope and tracked under follow-up specs.

Implementation language: **TypeScript** (matches the design document and the existing codebase).

## Tasks

- [x] 1. Phase 1 — Add canonical API surface alongside legacy
  - [x] 1.1 Install Vitest + lint + Playwright devDependencies
    - Add `vitest`, `@vitest/coverage-v8`, `@vue/test-utils`, `@pinia/testing`, `jsdom`, `vue-tsc`, `@typescript-eslint/parser`, `eslint-plugin-import`, `vue-eslint-parser`, `@playwright/test` to `fluxury-app/package.json` `devDependencies`
    - Run `npm install` and commit `package-lock.json`
    - _Requirements: 4.1, 5.1, 6.1, 9.1_

  - [x] 1.2 Create `vitest.config.ts`
    - Set `test.environment` to `jsdom`
    - Wire `resolve.alias` for `@/` to `./src`
    - Set `test.setupFiles: ['./tests/setup.ts']`
    - Set `test.include` to `src/**/*.test.ts` and `tests/integration/**/*.test.ts`
    - Configure `test.coverage` with provider `v8`
    - _Requirements: 4.1_

  - [x] 1.3 Create `tests/setup.ts`
    - Import `createTestingPinia` from `@pinia/testing`
    - Register a `beforeEach` hook that calls `resetMockBackend()` from `@/services/api` so each test starts with a fresh `MockStorage`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.5_

  - [x] 1.4 Create `src/services/api/types.ts` (relocate domain types)
    - Move `SessionSummary`, `GetSessionResponseContent`, `CreateSessionRequestContent`, `UpdateSessionRequestContent` from `src/api/open-api/session-client/index.ts`
    - Move `BeatSummary`, `ListBeatsResponseContent`, `CreateBeatRequestContent` from `src/api/open-api/beat-client/index.ts`
    - This file becomes the single source of truth for domain types
    - _Requirements: 2.2_

  - [x] 1.5 Stub the old open-api index files with type-only re-exports
    - Replace contents of `src/api/open-api/session-client/index.ts` with `export type * from '@/services/api/types'`
    - Replace contents of `src/api/open-api/beat-client/index.ts` with `export type * from '@/services/api/types'`
    - This keeps existing import paths compiling during Phases 2–3; the files are deleted in Phase 4
    - _Requirements: 2.1, 2.2_

  - [x] 1.6 Create `src/services/api/contracts.ts`
    - Define `SessionsApiContract`, `BeatsApiContract`, `AuthApiContract`, `StorageApiContract` interfaces per the design
    - Define `AuthUser` interface
    - This file is the binding contract that both `mock.ts` and `real.ts` must satisfy
    - _Requirements: 1.1, 2.2_

  - [x] 1.7 Refactor `src/services/mockApiService.ts` to a swappable `_storage` instance
    - Export `MockStorage` class
    - Add a module-private `_storage` variable initialized to `new MockStorage()`
    - Add `__resetMockStorage()` that reassigns `_storage = new MockStorage()`
    - Convert `mockSessionsApi`, `mockBeatsApi`, `mockAuthService`, and `mockS3Service` exports to thin shims that delegate to the current `_storage`
    - Leave the rest of the file shape unchanged so existing callers in `demoApiClients.ts` keep working
    - _Requirements: 7.4, 7.5_

  - [x] 1.8 Audit `src/data/mockData.ts` for nondeterminism
    - Search `generateMoreSessions(7)` for `Math.random()`, `Date.now()`, or any other nondeterministic source
    - Replace any nondeterministic source with a fixed seed function or static data so two consecutive `MockStorage` constructions produce identical observable state
    - This is a precondition for the Reset_Action determinism property
    - _Requirements: 7.5_

  - [x] 1.9 Create `src/services/api/mock.ts`
    - Re-export `sessionsApi`, `beatsApi`, `authApi`, `storageApi` objects that satisfy the contracts in `contracts.ts`
    - Each object delegates to the corresponding shim in `mockApiService.ts`
    - Re-export `__resetMockStorage` so `reset.ts` can call it without reaching into `mockApiService.ts`
    - Use `satisfies` against the contract interfaces so type errors surface here
    - _Requirements: 1.1, 1.2, 4.5_

  - [x] 1.10 Create `src/services/api/real.ts`
    - Implement `sessionsApi`, `beatsApi`, `authApi`, `storageApi` as thin axios wrappers built on top of `auth-interceptor.ts`
    - Use `satisfies` against the contracts so the structural conformance test (Req 4.6) can compare object identity
    - Add a `// TODO(post-stabilization): real-mode boot completion is punted to a follow-up spec` comment at the top of the file
    - _Requirements: 1.1, 1.2, 4.6, 10.3_

  - [x] 1.11 Create `src/services/api/reset.ts`
    - Export `resetMockBackend(): Promise<void>` that calls `__resetMockStorage()` then `Promise.all([useSessionStore().fetchSessions(), useBeatStore().fetchBeats()])`
    - On failure, surface via `setError` on the affected store and re-throw so callers can show a "Reset failed" state
    - _Requirements: 7.4, 7.5_

  - [x] 1.12 Create `src/services/api/index.ts` (the canonical surface)
    - Export `resolveDemoMode(env)` — reads `VITE_DEMO_MODE`, returns `true` when unset/empty/`"true"`, returns `false` otherwise
    - Export `isDemoMode` constant
    - Export `sessionsApi`, `beatsApi`, `authApi`, `storageApi` selected from either `mock.ts` or `real.ts` based on `isDemoMode`
    - Re-export `resetMockBackend` from `./reset`
    - Re-export contract types and domain types so callers can do `import type { SessionSummary } from '@/services/api'`
    - _Requirements: 1.1, 1.2, 10.1, 10.3_

  - [x] 1.13 Phase 1 verification
    - Run `npm run dev` and confirm the app boots
    - Manually navigate to `/sessions`, `/beats`, and a session editor; confirm behavior is identical to before
    - Run `npm test` and confirm Vitest exits 0 (zero tests is fine at this stage)
    - Confirm nothing under `src/` imports from `@/services/api` yet — this phase is purely additive

- [x] 2. Phase 2 — Migrate stores to canonical surface
  - [x] 2.1 Migrate `sessionStore.ts` imports
    - Change runtime imports from `@/services/demoApiClients` to `@/services/api`
    - Change type imports for `SessionSummary` etc. to come from `@/services/api`
    - _Requirements: 1.3, 3.2_

  - [x] 2.2 Add `sessionStore.saveScript(id, delta)` action
    - Action calls `storageApi.uploadSessionScript(id, delta)` then `sessionsApi.updateSession(id, ...)`
    - This is the single integration point the editor will use; it preserves the layering invariant by keeping `storageApi` access inside the store
    - _Requirements: 3.1, 3.2_

  - [x] 2.3 Migrate `beatStore.ts` imports
    - Change runtime imports from `@/services/demoApiClients` to `@/services/api`
    - Change type imports for `BeatSummary`, `CreateBeatRequestContent` to come from `@/services/api`
    - _Requirements: 1.3, 3.2_

  - [x] 2.4 Refactor `authStore.ts`
    - Remove the inline demo-vs-real branching (the dynamic `import('aws-amplify/auth')` and `import('@/api/auth-interceptor')` calls)
    - Call `authApi.login`, `authApi.logout`, `authApi.isAuthenticated`, `authApi.getCurrentUser` from `@/services/api` unconditionally
    - Downgrade the existing `console.error('Auth status check failed', ...)` log to `console.warn` so it does not break the boot console budget if a future real-mode failure surfaces
    - _Requirements: 1.3, 3.2, 8.1_

  - [ ]* 2.5 Write `src/stores/sessionStore.test.ts`
    - Cover list, get, create, update, and delete operations against the mock backend
    - Use `createTestingPinia` and a `beforeEach` `resetMockBackend()` from `tests/setup.ts`
    - _Requirements: 4.2_

  - [ ]* 2.6 Write `src/stores/beatStore.test.ts`
    - Cover list, create, and delete operations against the mock backend
    - _Requirements: 4.3_

  - [ ]* 2.7 Write `src/stores/authStore.test.ts`
    - Cover login, logout, and `checkAuthStatus` behavior in demo mode
    - _Requirements: 4.4_

  - [ ]* 2.8 Write `src/services/api/index.test.ts`
    - Three `vi.stubEnv`-driven tests: `VITE_DEMO_MODE="true"` returns mock; `VITE_DEMO_MODE="false"` returns real; unset/empty defaults to demo
    - Use `vi.resetModules()` between cases because `index.ts` evaluates env at module load
    - _Requirements: 4.5, 4.6, 10.1, 10.3_

  - [ ]* 2.9 Write `src/services/api/reset.test.ts`
    - Call `resetMockBackend()` twice in succession and assert that `sessionsApi.listSessions()` returns identical results both times
    - Same assertion for `beatsApi.listBeats()`
    - _Requirements: 7.5_

  - [x] 2.10 Phase 2 verification
    - Run `npm test` and confirm all store tests pass
    - Run `npm run dev` and manually click through `/sessions`, `/beats`, and a session editor — behavior unchanged
    - Confirm `console.error` count on boot is unchanged from Phase 1 baseline

- [ ] 3. Phase 3 — Migrate views, add lint rules and AST scans
  - [x] 3.1 Refactor `SessionBrowserView.vue`
    - Replace `@/api/api-clients` and `@/api/open-api/session-client` imports with `useSessionStore()` actions and types from `@/services/api` (per the design's migration table)
    - Add `data-testid="session-card"` to each rendered session item — required by the smoke test
    - _Requirements: 1.3, 1.4, 1.5, 3.1, 3.3, 3.4, 5.3_

  - [x] 3.2 Refactor `BeatBrowserView.vue`
    - Replace `@/api/api-clients` and `@/api/open-api/beat-client` imports with `useBeatStore()` actions and types from `@/services/api`
    - _Requirements: 1.3, 1.4, 1.5, 3.1, 3.3, 3.4_

  - [x] 3.3 Refactor `AddBeatView.vue`
    - Replace `@/api/api-clients` and `@/api/open-api/beat-client` imports with `useBeatStore().createBeat(payload)` and types from `@/services/api`
    - _Requirements: 1.3, 1.4, 1.5, 3.1, 3.3, 3.4_

  - [x] 3.4 Refactor `SessionEditorView.vue`
    - Replace `@/services/demoApiClients` and `@/api/open-api/session-client` imports with `useSessionStore()` / `useBeatStore()` and types from `@/services/api`
    - Replace `mockS3Service` calls with `sessionStore.saveScript(id, delta)` (added in 2.2)
    - Remove the `await import('@/services/s3Service')` real-mode branch — the store action is the single integration point
    - Add `data-testid="script-editor"` to the Quill mount element
    - Add `data-testid="autosave-status"` to the save-status `<p>` — required by the smoke test
    - _Requirements: 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 5.4, 5.5_

  - [x] 3.5 Replace `src/components/DemoBanner.vue` per the design
    - Display the exact text `DEMO MODE — credentials are not real, data resets on reload`
    - Show the banner only when `isDemoMode === true` (read from `@/services/api`); render nothing in real mode
    - Remove the close button and the `hideDemoBanner` localStorage logic
    - Add a `data-testid="reset-demo-data"` button that calls `resetMockBackend()` from `@/services/api`
    - During the in-flight reset Promise, show "Resetting…" and disable the button
    - Do NOT call `window.location.reload()` and do NOT show a `confirm()` dialog
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

  - [ ]* 3.6 Write `src/components/DemoBanner.test.ts`
    - Assert the exact Req 7.1 copy renders when in demo mode (use `vi.stubEnv('VITE_DEMO_MODE', 'true')`)
    - Assert the reset control is present in demo mode
    - Assert the banner renders nothing when `vi.stubEnv('VITE_DEMO_MODE', 'false')`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 3.7 Rewrite `.eslintrc.js`
    - Use `vue-eslint-parser` as the top-level parser with `@typescript-eslint/parser` for `<script>` blocks
    - Add `@typescript-eslint` and `import` plugins
    - Add a global `no-restricted-imports` rule forbidding `@/services/demoApiClients` from anywhere
    - Add an `overrides` entry for `src/views/**/*.vue` forbidding `@/api/*`, `@/api/**`, `@/services/api`, `@/services/api/*`, `@/services/api/**`, `@/services/demoApiClients`, `@/services/mockApiService`, `@/services/s3Service`
    - Add an `overrides` entry for `src/stores/**/*.ts` forbidding `@/api/*`, `@/api/**`, `@/services/demoApiClients`, `@/services/mockApiService`
    - _Requirements: 1.4, 1.5, 1.6, 3.3, 3.4_

  - [ ]* 3.8 Write `tests/integration/layering.test.ts`
    - Glob `src/views/**/*.vue` and regex-scan each file for forbidden import patterns: `@/api/`, `@/services/api(/|$)`, `@/services/demoApiClients`, `@/services/mockApiService`, `@/services/s3Service`
    - Fail if any view contains any forbidden pattern
    - _Requirements: 3.5_

  - [ ]* 3.9 Write `tests/integration/canonical-surface.test.ts`
    - Test 1: `vi.stubEnv('VITE_DEMO_MODE', 'true')` → `api.isDemoMode === true`, `sessionsApi.listSessions()` returns at least one seeded session
    - Test 2: `vi.stubEnv('VITE_DEMO_MODE', 'false')` → `api.isDemoMode === false`, `api.sessionsApi === real.sessionsApi`
    - Test 3: `vi.stubEnv('VITE_DEMO_MODE', '')` → `api.isDemoMode === true`
    - Test 4: contract conformance — both `mock.sessionsApi` and `real.sessionsApi` expose all methods declared on `SessionsApiContract`
    - _Requirements: 4.5, 4.6, 10.1, 10.3_

  - [ ]* 3.10 Write `tests/integration/eslint-rules.test.ts`
    - Use `ESLint.lintText` against an inline known-bad fixture (e.g., a fake Vue view importing `sessionsApi` from `@/api/api-clients`) and assert the rule fires
    - Repeat for a fake store importing from `@/api/api-clients` and assert the rule fires
    - This is the self-test that protects against silent override-glob regressions
    - _Requirements: 1.4, 1.5, 1.6, 3.3, 3.4_

  - [ ] 3.11 Phase 3 verification
    - Run `npm run lint` and confirm zero violations
    - Run `npm test` and confirm all integration + store tests pass
    - Run `npm run dev`, navigate to `/sessions`, and confirm zero `console.error` calls before first paint completes
    - Manual smoke: load each view in turn and confirm data renders

- [ ] 4. Phase 4 — Delete legacy paths
  - [ ] 4.1 Delete the open-api stub index files
    - Delete `src/api/open-api/session-client/index.ts`
    - Delete `src/api/open-api/beat-client/index.ts`
    - Safe because all type imports now resolve via `@/services/api/types.ts` (Phase 1)
    - _Requirements: 2.1, 2.2_

  - [ ] 4.2 Delete `src/services/demoApiClients.ts`
    - All callers were migrated in Phase 2 (stores) and Phase 3 (views)
    - _Requirements: 1.1, 2.1_

  - [ ] 4.3 Delete `src/services/api.ts`
    - Dead since the Amplify v5 migration; verify with `grep -r "from '@/services/api'" src/` shows only the new `services/api/` directory imports
    - _Requirements: 2.1_

  - [ ] 4.4 Delete `src/services/sessionApi.ts`
    - Dead — uses removed Amplify v5 API
    - _Requirements: 2.1_

  - [ ] 4.5 Remove the `demoHelpers` block from `src/services/mockApiService.ts`
    - Replace `demoHelpers.resetDemo()` semantics with the `resetMockBackend()` function in `src/services/api/reset.ts` (already done in Phase 1)
    - Leave `MockStorage`, `__resetMockStorage`, and the `mockSessionsApi`/`mockBeatsApi`/`mockAuthService`/`mockS3Service` exports in place
    - _Requirements: 7.4_

  - [ ]* 4.6 Write `tests/integration/stub-references.test.ts`
    - Glob `src/**/*.{ts,vue}` and regex-scan for any reference to `@/api/open-api/session-client`, `@/api/open-api/beat-client`, or `@/services/demoApiClients`
    - Fail if any reference is found
    - _Requirements: 2.3_

  - [ ] 4.7 Phase 4 verification
    - Run `npm run lint` — zero violations
    - Run `npm test` — all green including the new stub-references test
    - Run `npm run dev` — boots clean, no broken imports
    - Confirm `find src/api/open-api -type f` returns no files (or only an empty directory)

- [ ] 5. Phase 5 — Playwright smoke, typecheck, and final scripts
  - [ ] 5.1 Install Playwright Chromium browser
    - Run `npx playwright install chromium`
    - This is a one-time local setup step; CI will run the same command in a follow-up spec
    - _Requirements: 5.1_

  - [ ] 5.2 Create `playwright.config.ts`
    - Single `chromium` project using `devices['Desktop Chrome']`
    - `webServer` block runs `npm run dev` on `http://localhost:5173` with `env: { VITE_DEMO_MODE: 'true' }` and a 60-second timeout
    - `reuseExistingServer: !process.env.CI` so local dev reuses an already-running server
    - `testDir: './tests/e2e'`, `timeout: 30_000`, `expect.timeout: 5_000`
    - _Requirements: 5.1, 5.2_

  - [ ] 5.3 Create `tests/e2e/smoke.spec.ts`
    - Attach `page.on('console', ...)` and `page.on('pageerror', ...)` listeners that push into `consoleErrors` and `pageErrors` arrays
    - Navigate to `/sessions` and assert `[data-testid="session-card"]` first item is visible within 10s
    - Click the first card and assert `[data-testid="script-editor"]` mounts within 10s
    - Click into `[data-testid="script-editor"] .ql-editor`, type a single character, and assert `[data-testid="autosave-status"]` matches `/saved/i` within 15s
    - At end, assert both `consoleErrors` and `pageErrors` arrays are empty
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.3_

  - [ ] 5.4 Update `package.json` `scripts` block
    - Add `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`, `"typecheck": "vue-tsc --noEmit"`
    - Update `"lint"` to `"eslint --ext .ts,.vue src/ tests/"`
    - Delete `"serve"` (calls long-since-replaced `vue-cli-service`)
    - Delete `"generate:api"` (no-op `echo`)
    - Delete `"clean"` (footgun-shaped)
    - Keep `"dev"`, `"build"`, `"preview"`, `"format"`
    - _Requirements: 4.1, 5.1, 6.1, 9.1_

  - [ ] 5.5 Time-boxed fix-or-suppress pass on `npm run typecheck`
    - Run `npm run typecheck`; for each error, either fix it (preferred when ≤10 minutes) or suppress with `// @ts-expect-error TODO(repo-stabilization): <reason>` and a tracking comment
    - Track the suppression count for follow-up; the goal is for `vue-tsc --noEmit` to exit 0 by the end of this task
    - _Requirements: 6.2, 6.3_

  - [ ]* 5.6 Write Vitest test asserting the four CI scripts exist
    - Read `package.json`, parse, and assert the `scripts` object has keys `test`, `test:e2e`, `typecheck`, `lint`
    - Locks the contract so a future contributor cannot silently delete a script
    - _Requirements: 9.1_

  - [ ]* 5.7 Write Vitest test asserting `README.md` documents each script
    - Read `fluxury-app/README.md` and assert the script names `test`, `test:e2e`, `typecheck`, `lint` each appear in the file
    - _Requirements: 9.3_

  - [ ] 5.8 Update `fluxury-app/README.md` `## Scripts` section
    - Document `dev`, `build`, `preview`, `lint`, `format`, `test`, `test:watch`, `test:e2e`, `typecheck` with the descriptions specified in the design
    - _Requirements: 9.3_

  - [ ] 5.9 Verify each CI script exits non-zero on failure
    - Introduce a deliberate violation per script: a lint violation, a failing Vitest test, a failing Playwright assertion, a type error
    - Run each of `npm run lint`, `npm test`, `npm run test:e2e`, `npm run typecheck` and confirm exit status is non-zero
    - Revert all deliberate violations
    - _Requirements: 1.6, 4.1, 5.1, 6.3, 9.2_

  - [ ] 5.10 Verify fresh checkout boots without `.env.local`
    - Temporarily rename `fluxury-app/.env.local` to `.env.local.bak`
    - Run `npm run dev`, navigate to `/sessions`, confirm the demo banner appears with the correct copy and a session list renders
    - Rename `.env.local.bak` back to `.env.local`
    - _Requirements: 10.1, 10.2_

  - [ ] 5.11 Phase 5 verification
    - Run all five scripts in sequence on a clean checkout: `npm run lint`, `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run format -- --check`
    - All must exit 0
    - Confirm the smoke test runs green
    - Confirm README documents every script
    - Confirm DemoBanner shows the correct Req 7.1 copy and the reset button reseeds data without a page reload
    - _Requirements: 5.1, 6.2, 9.2, 9.3, 7.1, 7.2, 7.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they cover unit tests, integration tests, and smoke-test scaffolding. Per the workflow rules they are **not** auto-implemented when running task execution; explicit user opt-in is required.
- Each task references the specific requirement clauses it satisfies. Per-phase verification subtasks correspond to the per-phase success criteria documented in `design.md` § Migration / Rollout Plan.
- No property-based tests are included: the design explicitly states that every acceptance criterion in this spec is a configuration check, lint/AST scan, render assertion, single-shot smoke check, or env-default behavior — there is no input space over which a `for-all` would catch additional bugs. Enforcement is via ESLint rules, regex-scan integration tests, contract-conformance tests, and the Playwright smoke (see `design.md` § Correctness Invariants and Enforcement, 27 invariants).
- CI/CD wiring (GitHub Actions, branch protection, deploy workflows) is **explicitly out of scope** and will be addressed in a follow-up `ci-and-deploy` spec. The deliverable here ends at "all four CI scripts exit zero on a clean checkout and non-zero on intentional failure."
- Real-mode (`VITE_DEMO_MODE=false`) wiring is punted: `real.ts` ships with a `// TODO(post-stabilization)` comment and contract-conformance tests assert structural shape only, not behavior. The next spec that touches real mode is responsible for finishing it.
- Phases are strictly sequential; the dependency graph below also reflects parallel-safe subtasks within each phase.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.6", "1.7", "1.8"] },
    { "id": 2, "tasks": ["1.5", "1.9", "1.10"] },
    { "id": 3, "tasks": ["1.11"] },
    { "id": 4, "tasks": ["1.12"] },
    { "id": 5, "tasks": ["1.3"] },
    { "id": 6, "tasks": ["1.13"] },
    { "id": 7, "tasks": ["2.1", "2.3", "2.4"] },
    { "id": 8, "tasks": ["2.2"] },
    { "id": 9, "tasks": ["2.5", "2.6", "2.7", "2.8", "2.9"] },
    { "id": 10, "tasks": ["2.10"] },
    { "id": 11, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.7"] },
    { "id": 12, "tasks": ["3.6", "3.8", "3.9", "3.10"] },
    { "id": 13, "tasks": ["3.11"] },
    { "id": 14, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 15, "tasks": ["4.6"] },
    { "id": 16, "tasks": ["4.7"] },
    { "id": 17, "tasks": ["5.1", "5.2", "5.4", "5.5", "5.8"] },
    { "id": 18, "tasks": ["5.3", "5.6", "5.7"] },
    { "id": 19, "tasks": ["5.9", "5.10"] },
    { "id": 20, "tasks": ["5.11"] }
  ]
}
```
