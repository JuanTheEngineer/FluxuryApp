# Requirements Document

## Introduction

This spec stabilizes the Fluxury web application as a foundation for production-grade development. It is the first in a sequence of three: **repo-stabilization** (this spec), **visual-foundation**, and **creative-core-loop**. The deliverable is technical-debt repayment, not user-facing functionality.

A tiger-team audit of the current codebase identified structural problems that prevent confidently building anything else: views and stores reach the API through inconsistent module paths, two stub modules throw at runtime when imported, demo mode auto-authenticates without clearly signaling its state, there is no automated test coverage, no typecheck script, and no script-level guardrails that fail loudly in CI. This spec defines the developer/operator capabilities needed to fix those problems and prove the result with automated tests.

The "user" in this document is the developer working on Fluxury. Acceptance criteria are written so that compliance can be verified automatically by lint rules, unit tests, integration tests, end-to-end tests, or AST inspection.

### In Scope

- A single canonical module path through which views and stores reach API clients
- Removal or replacement of throwing stub modules under `src/api/open-api/`
- A layering invariant where views go through Pinia stores and stores are the only callers of the canonical API surface
- A Vitest unit/integration test harness with store and routing tests
- A Playwright end-to-end smoke test
- A typecheck script and CI-friendly scripts that exit non-zero on failure
- Clearer demo-mode signaling and a reset action that does not reload the page
- A clean console on first paint, verified by the smoke test
- Environment safety so a missing `.env.local` does not crash boot

### Out of Scope

The following are explicitly deferred to other specs and MUST NOT appear as requirements here:

- Design system, typography, dark theme, component primitives (deferred to **visual-foundation**)
- Autosave behavior, save-status state machine, draft persistence, offline handling, zero-data-loss guarantees (deferred to **creative-core-loop**)
- Cognito hardening or production auth flows
- Real S3 wiring or AWS production configuration
- GitHub Actions or CI/CD pipeline setup
- Production deployment
- Performance optimization
- New product features

## Glossary

- **Fluxury_App**: The Vue 3 + TypeScript + Vite + Pinia + Tailwind web application contained in `fluxury-app/`.
- **Canonical_API_Surface**: A single module path (for example `@/services/api`) from which every view and every store obtains API clients. The choice between mock and real clients is encapsulated inside this module and is not visible to callers.
- **Demo_Mode**: The runtime mode in which the Canonical_API_Surface returns mock clients backed by `mockApiService`. Demo_Mode is enabled when the environment variable `VITE_DEMO_MODE` is the string `"true"`.
- **Real_Mode**: The runtime mode in which the Canonical_API_Surface returns the AWS-backed clients defined in `src/api/api-clients.ts`. Real_Mode applies when Demo_Mode is not enabled.
- **Stub_Module**: Any module whose exports only throw an error directing the caller to import from a different module. The files at `src/api/open-api/session-client/index.ts` and `src/api/open-api/beat-client/index.ts` are the current Stub_Modules.
- **Layering_Invariant**: The architectural rule that views import only from Pinia stores (and from presentational components and composables), and that Pinia stores are the only callers of the Canonical_API_Surface.
- **Mock_Store**: The in-memory data backing Demo_Mode, seeded by `mockApiService` and including sessions, beats, the active user, and authentication state.
- **Reset_Action**: A developer-facing affordance in the DemoBanner that reseeds the Mock_Store to its initial state and refreshes Pinia store data without invoking `window.location.reload()`.
- **Smoke_Test**: A Playwright end-to-end test that boots the Fluxury_App, navigates to the sessions list, opens a session, types into the editor, and asserts the absence of console errors and unhandled rejections during the run.
- **Vitest_Harness**: The Vitest configuration, fixtures, and tests that run when `npm test` is executed.
- **Playwright_Harness**: The Playwright configuration, fixtures, and tests that run when `npm run test:e2e` is executed.

## Requirements

### Requirement 1: Single Canonical API Client Surface

**User Story:** As a Fluxury developer, I want every view and store to reach API clients through one canonical module, so that wiring is consistent and the mock-versus-real choice lives in exactly one place.

#### Acceptance Criteria

1. THE Fluxury_App SHALL expose API clients from exactly one Canonical_API_Surface module path.
2. THE Canonical_API_Surface SHALL select between mock clients and real clients based on the value of the `VITE_DEMO_MODE` environment variable.
3. WHEN a Vue view or Pinia store needs an API client, THE view or store SHALL import the client from the Canonical_API_Surface.
4. IF a Vue view or Pinia store imports from `@/api/api-clients`, THEN THE lint configuration SHALL report a violation.
5. IF a Vue view or Pinia store imports from any module under `@/api/open-api/`, THEN THE lint configuration SHALL report a violation.
6. THE `npm run lint` command SHALL exit with a non-zero status when any violation defined in criteria 4 or 5 is present in the source tree.

### Requirement 2: Stub Module Elimination

**User Story:** As a Fluxury developer, I want no modules that exist solely to throw at runtime, so that imports cannot accidentally route through landmine code.

#### Acceptance Criteria

1. THE Fluxury_App SHALL contain zero Stub_Modules under `src/api/open-api/`.
2. WHERE the Canonical_API_Surface requires OpenAPI-generated types or clients in Real_Mode, THE Fluxury_App SHALL provide them from a working implementation rather than a Stub_Module.
3. IF a module path previously occupied by a Stub_Module is referenced from anywhere in the source tree, THEN the Vitest_Harness SHALL include a test that fails when such a reference exists.

### Requirement 3: Layering Invariant Between Views, Stores, and API

**User Story:** As a Fluxury developer, I want views to read and mutate data only through Pinia stores, so that data flow is predictable and future autosave and save-status work has a single integration point.

#### Acceptance Criteria

1. THE Vue views SHALL access session and beat data exclusively through their respective Pinia stores.
2. THE Pinia stores SHALL be the only callers of the Canonical_API_Surface.
3. IF a Vue view imports the Canonical_API_Surface directly, THEN THE lint configuration SHALL report a violation.
4. IF a Vue view imports `@/api/api-clients` or any module under `@/api/open-api/`, THEN THE lint configuration SHALL report a violation.
5. THE Vitest_Harness SHALL include a test that scans the `src/views/` directory and fails when any file under it imports from `src/api/`, `src/services/api.ts`, `src/services/demoApiClients.ts`, or any successor Canonical_API_Surface module path.

### Requirement 4: Vitest Unit and Integration Test Harness

**User Story:** As a Fluxury developer, I want `npm test` to run a Vitest suite covering stores and API routing, so that regressions in wiring are caught before merge.

#### Acceptance Criteria

1. WHEN `npm test` is executed in the `fluxury-app/` directory, THE Vitest_Harness SHALL run the Vitest suite and exit with status 0 on success and a non-zero status on any test failure.
2. THE Vitest_Harness SHALL include tests for `sessionStore` covering list, get, create, update, and delete operations against the mock backend.
3. THE Vitest_Harness SHALL include tests for `beatStore` covering list and get operations against the mock backend.
4. THE Vitest_Harness SHALL include tests for `authStore` covering login, logout, and checkAuthStatus behavior in Demo_Mode.
5. THE Vitest_Harness SHALL include a test asserting that the Canonical_API_Surface returns mock clients when `VITE_DEMO_MODE` is `"true"`.
6. THE Vitest_Harness SHALL include a test asserting that the Canonical_API_Surface returns the real-client module when `VITE_DEMO_MODE` is unset or any value other than `"true"`.

### Requirement 5: Playwright End-to-End Smoke Test

**User Story:** As a Fluxury developer, I want one Playwright test that proves the app is alive end-to-end, so that I have a single signal that the user-visible flow still works.

#### Acceptance Criteria

1. WHEN `npm run test:e2e` is executed in the `fluxury-app/` directory, THE Playwright_Harness SHALL run the Smoke_Test against a served instance of the Fluxury_App and exit with status 0 on success and a non-zero status on any failure.
2. THE Smoke_Test SHALL boot the Fluxury_App with Demo_Mode enabled and navigate to `/sessions`.
3. THE Smoke_Test SHALL assert that the sessions list renders at least one session item from the Mock_Store.
4. WHEN the Smoke_Test clicks the first session item, THE Smoke_Test SHALL assert that the session editor mounts and the script editor element is present in the DOM.
5. WHEN the Smoke_Test types a single character into the script editor, THE Smoke_Test SHALL assert that an autosave indicator transitions to a "saved" state within 15 seconds.
6. IF the browser context records a `console.error` call during the Smoke_Test, THEN THE Smoke_Test SHALL fail.
7. IF the browser context records an unhandled promise rejection during the Smoke_Test, THEN THE Smoke_Test SHALL fail.

### Requirement 6: Typecheck Script

**User Story:** As a Fluxury developer, I want `npm run typecheck` to validate types without producing output artifacts, so that type errors surface in CI rather than only at build time.

#### Acceptance Criteria

1. THE `package.json` of the Fluxury_App SHALL define a `typecheck` script that runs `vue-tsc --noEmit` (or an equivalent TypeScript-aware Vue typechecker).
2. WHEN `npm run typecheck` is executed and no type errors exist, THE typecheck script SHALL exit with status 0.
3. WHEN `npm run typecheck` is executed and one or more type errors exist, THE typecheck script SHALL exit with a non-zero status.

### Requirement 7: Demo-Mode Signaling and Reset

**User Story:** As a Fluxury developer or demo viewer, I want explicit demo-mode signaling and a way to reseed mock data without reloading the page, so that I can tell whether I am in Demo_Mode and can iterate quickly during development.

#### Acceptance Criteria

1. WHILE the Fluxury_App is in Demo_Mode, THE DemoBanner SHALL display the text "DEMO MODE — credentials are not real, data resets on reload".
2. WHILE the Fluxury_App is in Demo_Mode, THE DemoBanner SHALL display a control labeled "Reset demo data" that triggers the Reset_Action.
3. WHILE the Fluxury_App is in Real_Mode, THE DemoBanner SHALL remain absent from the rendered DOM.
4. WHEN the Reset_Action is invoked, THE Fluxury_App SHALL reseed the Mock_Store to its initial state and refresh data in the active Pinia stores without invoking `window.location.reload()`.
5. WHEN the Reset_Action is invoked twice in succession, THE Mock_Store SHALL produce identical observable session, beat, and user state after each invocation.
6. THE DemoBanner SHALL visually distinguish Demo_Mode from a logged-in Real_Mode user by displaying the demo label and the Reset_Action control only in Demo_Mode.

### Requirement 8: Clean Console on Boot

**User Story:** As a Fluxury developer, I want the application to boot without console errors or unhandled rejections, so that the console is a reliable signal of real problems.

#### Acceptance Criteria

1. WHEN the Fluxury_App boots in Demo_Mode and navigates to `/sessions`, THE Fluxury_App SHALL produce zero `console.error` calls before the sessions list completes its first render.
2. WHEN the Fluxury_App boots in Demo_Mode and navigates to `/sessions`, THE Fluxury_App SHALL produce zero unhandled promise rejections before the sessions list completes its first render.
3. THE Smoke_Test SHALL verify the conditions in criteria 1 and 2 by attaching listeners to the browser context for the duration of the test run.

### Requirement 9: CI-Friendly Scripts and Documentation

**User Story:** As a Fluxury developer, I want `test`, `test:e2e`, `typecheck`, and `lint` scripts that exit non-zero on failure and are documented in the README, so that CI integration in a future spec is a small step.

#### Acceptance Criteria

1. THE `package.json` of the Fluxury_App SHALL define each of the scripts `test`, `test:e2e`, `typecheck`, and `lint`.
2. IF any of the `test`, `test:e2e`, `typecheck`, or `lint` scripts encounters a failure, THEN THE script SHALL exit with a non-zero status code.
3. THE Fluxury_App README SHALL document the command and intended use for each of `test`, `test:e2e`, `typecheck`, and `lint`.

### Requirement 10: Environment Safety and Default Mode

**User Story:** As a Fluxury developer, I want the app to boot safely without an `.env.local` file, so that a fresh checkout is usable without setup.

#### Acceptance Criteria

1. IF `VITE_DEMO_MODE` is unset or has an empty value at boot, THEN THE Canonical_API_Surface SHALL default to Demo_Mode.
2. IF the Fluxury_App is started without an `.env.local` file present, THEN THE Fluxury_App SHALL boot successfully in Demo_Mode.
3. WHEN `VITE_DEMO_MODE` is set to any value other than `"true"` and `.env.local` is present, THE Canonical_API_Surface SHALL select Real_Mode.
