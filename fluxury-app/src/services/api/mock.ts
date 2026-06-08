// Canonical mock API surface — repo-stabilization task 1.9.
//
// Re-exports the existing mock services from `@/services/mockApiService` under
// the canonical names (`sessionsApi`, `beatsApi`, `authApi`, `storageApi`) and
// uses `satisfies` to enforce structural conformance with the contracts in
// `./contracts`. If a mock drifts from the contract, the type error surfaces
// here rather than at every call site.
//
// Note: the auth surface in `mockApiService.ts` is exported as `mockAuthService`,
// but the canonical name is `authApi`. The other three line up by renaming
// `mock<Domain>Api` -> `<domain>Api`.
//
// This file intentionally contains zero logic: every export is a re-export of
// an existing mock object. Behavior changes belong in `mockApiService.ts`.

import {
  mockSessionsApi,
  mockBeatsApi,
  mockAuthService,
  mockS3Service,
  __resetMockStorage,
} from '@/services/mockApiService'
import type {
  SessionsApiContract,
  BeatsApiContract,
  AuthApiContract,
  StorageApiContract,
} from './contracts'

// `satisfies` causes a compile error if the underlying mock drifts from the
// contract while preserving the inferred type — required for the contract
// conformance test in task 3.9.
export const sessionsApi = mockSessionsApi satisfies SessionsApiContract
export const beatsApi = mockBeatsApi satisfies BeatsApiContract
export const authApi = mockAuthService satisfies AuthApiContract
export const storageApi = mockS3Service satisfies StorageApiContract

// Re-export the internal reset hook so `reset.ts` can call it without
// reaching into `mockApiService.ts` directly.
export { __resetMockStorage }
