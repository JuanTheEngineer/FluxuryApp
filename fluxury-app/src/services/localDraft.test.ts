import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Reset the module between tests to get a fresh singleton
async function createFreshService() {
  // We need to re-import to get a fresh instance since the module caches state
  vi.resetModules()
  const mod = await import('./localDraft')
  return mod.localDraftService
}

function makeDraft(sessionId: string, editTimestamp = Date.now()): import('./localDraft').LocalDraft {
  return {
    sessionId,
    delta: { ops: [{ insert: 'hello world\n' }] },
    editTimestamp,
    cursorPosition: 5,
    beatPlaybackPosition: 10.5,
    beatVolume: 0.8,
    beatLooping: true,
  }
}

describe('LocalDraftService - IndexedDB path', () => {
  let service: import('./localDraft').LocalDraftService

  beforeEach(async () => {
    service = await createFreshService()
  })

  it('returns null for a non-existent draft', async () => {
    const result = await service.get('non-existent-session')
    expect(result).toBeNull()
  })

  it('stores and retrieves a draft', async () => {
    const draft = makeDraft('session-1')
    await service.set(draft)
    const retrieved = await service.get('session-1')
    expect(retrieved).toEqual(draft)
  })

  it('reports isAvailable as true after first operation', async () => {
    await service.get('any')
    expect(service.isAvailable()).toBe(true)
  })

  it('overwrites an existing draft with set', async () => {
    const draft1 = makeDraft('session-1', 1000)
    const draft2 = makeDraft('session-1', 2000)
    draft2.delta = { ops: [{ insert: 'updated\n' }] }

    await service.set(draft1)
    await service.set(draft2)

    const retrieved = await service.get('session-1')
    expect(retrieved).toEqual(draft2)
  })

  it('deletes a draft', async () => {
    const draft = makeDraft('session-1')
    await service.set(draft)
    await service.delete('session-1')
    const result = await service.get('session-1')
    expect(result).toBeNull()
  })

  it('handles multiple sessions independently', async () => {
    const draft1 = makeDraft('session-1')
    const draft2 = makeDraft('session-2')

    await service.set(draft1)
    await service.set(draft2)

    expect(await service.get('session-1')).toEqual(draft1)
    expect(await service.get('session-2')).toEqual(draft2)

    await service.delete('session-1')
    expect(await service.get('session-1')).toBeNull()
    expect(await service.get('session-2')).toEqual(draft2)
  })
})

describe('LocalDraftService - localStorage fallback', () => {
  let service: import('./localDraft').LocalDraftService

  beforeEach(async () => {
    localStorage.clear()
    // Simulate IndexedDB unavailability by removing it before module loads
    const origIndexedDB = globalThis.indexedDB
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true })

    service = await createFreshService()

    // Trigger init so it detects no IDB
    await service.get('any')

    // Restore after init detection
    Object.defineProperty(globalThis, 'indexedDB', { value: origIndexedDB, configurable: true })
  })

  it('reports isAvailable as false when IndexedDB is unavailable', () => {
    expect(service.isAvailable()).toBe(false)
  })

  it('stores and retrieves from localStorage', async () => {
    const draft = makeDraft('session-ls')
    await service.set(draft)
    const retrieved = await service.get('session-ls')
    expect(retrieved).toEqual(draft)
  })

  it('deletes from localStorage', async () => {
    const draft = makeDraft('session-ls')
    await service.set(draft)
    await service.delete('session-ls')
    expect(await service.get('session-ls')).toBeNull()
    expect(localStorage.getItem('fluxury-draft-session-ls')).toBeNull()
  })

  it('evicts oldest draft on quota exceeded', async () => {
    // Manually set up some existing drafts in localStorage with different timestamps
    const oldDraft = makeDraft('old-session', 1000)
    const newerDraft = makeDraft('newer-session', 2000)
    localStorage.setItem('fluxury-draft-old-session', JSON.stringify(oldDraft))
    localStorage.setItem('fluxury-draft-newer-session', JSON.stringify(newerDraft))

    // Mock localStorage.setItem to throw QuotaExceededError on first call, then succeed
    let shouldThrow = true
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (shouldThrow) {
        shouldThrow = false
        const error = new DOMException('Quota exceeded', 'QuotaExceededError')
        throw error
      }
      originalSetItem.call(this, key, value)
    }

    const currentDraft = makeDraft('current-session', 3000)
    await service.set(currentDraft)

    // Restore before assertions
    Storage.prototype.setItem = originalSetItem

    // The oldest draft (old-session) should have been evicted
    expect(localStorage.getItem('fluxury-draft-old-session')).toBeNull()
    // Newer draft should still exist
    expect(localStorage.getItem('fluxury-draft-newer-session')).not.toBeNull()
    // Current draft should have been written on retry
    const retrieved = await service.get('current-session')
    expect(retrieved).toEqual(currentDraft)
  })
})
