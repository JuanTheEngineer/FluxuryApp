import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import 'fake-indexeddb/auto'
import { arbitrarySessionState } from '@/test-utils/generators'

// Tag: Feature: creative-core-loop, Property 8: local draft write correctness

/**
 * Validates: Requirements 6.1, 9.1
 *
 * Tests the correctness properties of the Local Draft storage layer:
 * - Round-trip: set then get returns identical data
 * - Overwrite preserves latest: last set wins
 * - Delete removes: set + delete → get returns null
 * - Independent sessions: operations on one session don't affect another
 */

// Fresh service factory using vi.resetModules() + dynamic import pattern
async function createFreshService() {
  vi.resetModules()
  const mod = await import('./localDraft')
  return mod.localDraftService
}

describe('LocalDraft property tests — IndexedDB path', () => {
  let service: import('./localDraft').LocalDraftService

  beforeEach(async () => {
    service = await createFreshService()
  })

  it('Property: round-trip — set then get returns identical data', async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySessionState(), async (draft) => {
        await service.set(draft)
        const retrieved = await service.get(draft.sessionId)
        expect(retrieved).toEqual(draft)
      }),
      { numRuns: 100 }
    )
  })

  it('Property: overwrite preserves latest — last set wins for same sessionId', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitrarySessionState(),
        arbitrarySessionState(),
        async (draft1, draft2) => {
          // Force same sessionId so both target the same slot
          const sessionId = draft1.sessionId
          const second = { ...draft2, sessionId }

          await service.set(draft1)
          await service.set(second)

          const retrieved = await service.get(sessionId)
          expect(retrieved).toEqual(second)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property: delete removes — set + delete → get returns null', async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySessionState(), async (draft) => {
        await service.set(draft)
        await service.delete(draft.sessionId)
        const retrieved = await service.get(draft.sessionId)
        expect(retrieved).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('Property: independent sessions — operations on one session do not affect another', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitrarySessionState(),
        arbitrarySessionState(),
        async (draftA, draftB) => {
          // Ensure distinct sessionIds
          fc.pre(draftA.sessionId !== draftB.sessionId)

          await service.set(draftA)
          await service.set(draftB)

          // Deleting B should not affect A
          await service.delete(draftB.sessionId)

          const retrievedA = await service.get(draftA.sessionId)
          expect(retrievedA).toEqual(draftA)

          const retrievedB = await service.get(draftB.sessionId)
          expect(retrievedB).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('LocalDraft property tests — localStorage fallback path', () => {
  let service: import('./localDraft').LocalDraftService

  beforeEach(async () => {
    localStorage.clear()
    // Simulate IndexedDB unavailability
    const origIndexedDB = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true })

    service = await createFreshService()
    // Trigger init so it detects no IDB
    await service.get('init-probe')

    // Restore indexedDB so other tests aren't affected
    Object.defineProperty(globalThis, 'indexedDB', { value: origIndexedDB, configurable: true })
  })

  it('Property: round-trip — set then get returns identical data via localStorage', async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySessionState(), async (draft) => {
        await service.set(draft)
        const retrieved = await service.get(draft.sessionId)
        expect(retrieved).toEqual(draft)
      }),
      { numRuns: 100 }
    )
  })

  it('Property: overwrite preserves latest — last set wins via localStorage', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitrarySessionState(),
        arbitrarySessionState(),
        async (draft1, draft2) => {
          const sessionId = draft1.sessionId
          const second = { ...draft2, sessionId }

          await service.set(draft1)
          await service.set(second)

          const retrieved = await service.get(sessionId)
          expect(retrieved).toEqual(second)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property: delete removes — set + delete → get returns null via localStorage', async () => {
    await fc.assert(
      fc.asyncProperty(arbitrarySessionState(), async (draft) => {
        await service.set(draft)
        await service.delete(draft.sessionId)
        const retrieved = await service.get(draft.sessionId)
        expect(retrieved).toBeNull()
      }),
      { numRuns: 100 }
    )
  })

  it('Property: independent sessions — operations on one session do not affect another via localStorage', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitrarySessionState(),
        arbitrarySessionState(),
        async (draftA, draftB) => {
          fc.pre(draftA.sessionId !== draftB.sessionId)

          await service.set(draftA)
          await service.set(draftB)

          await service.delete(draftB.sessionId)

          const retrievedA = await service.get(draftA.sessionId)
          expect(retrievedA).toEqual(draftA)

          const retrievedB = await service.get(draftB.sessionId)
          expect(retrievedB).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })
})
