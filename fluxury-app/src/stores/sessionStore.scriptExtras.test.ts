import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decodeServerScript, encodeServerScript } from '@/services/resume'

/**
 * Timed lyrics (Step 0): script.json may hold fields this editor doesn't edit,
 * such as `timing`. Every save must send them back unchanged, or opening a
 * session in the classic editor would erase the sections the new editor made.
 */
const api = {
  createSession: vi.fn<(p: any) => Promise<any>>(),
  updateSession: vi.fn<(id: string, p: any) => Promise<any>>(),
  uploadSessionScript: vi.fn<(id: string, body: any, expected?: any) => Promise<any>>(),
  downloadSessionScript: vi.fn<(id: string) => Promise<any>>(),
}
vi.mock('@/services/api', () => ({
  sessionsApi: {
    createSession: (p: any) => api.createSession(p),
    updateSession: (id: string, p: any) => api.updateSession(id, p),
  },
  storageApi: {
    uploadSessionScript: (id: string, body: any, expected?: any) => api.uploadSessionScript(id, body, expected),
    downloadSessionScript: (id: string) => api.downloadSessionScript(id),
  },
}))
vi.mock('@/services/localDraft', () => ({ localDraftService: { delete: vi.fn() } }))

const timing = { v: 1, beatId: 'dietrying', sections: [{ id: 's1', name: 'Verse 1', startMs: 0, endMs: 60000, bpm: 111.1 }] }
const timedDelta = { ops: [{ insert: 'bar one' }, { insert: '\n', attributes: { time: '8720' } }] }
const stored = { delta: timedDelta, editTimestamp: 1000, timing, someFutureField: [1, 2] }

async function freshStore() {
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSessionStore } = await import('./sessionStore')
  const store = useSessionStore()
  store.activeSession = { id: 's1', name: 'Late Night', beatId: 'beat-1' } as any
  return store
}
const uploadedBody = (call = 0) => api.uploadSessionScript.mock.calls[call][1]

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.downloadSessionScript.mockResolvedValue({ content: stored, version: '"e1"' })
  api.uploadSessionScript.mockResolvedValue({ url: 's3://b/sessions/s1/script.json', version: '"e2"' })
  api.updateSession.mockResolvedValue({ data: {} })
  api.createSession.mockResolvedValue({ data: { id: 'copy' } })
})

describe('script fields the editor does not edit', () => {
  it('survive a save: timing and unknown future fields go back unchanged', async () => {
    const store = await freshStore()
    await store.loadScript('s1', 's3://b/sessions/s1/script.json')
    const edited = { ops: [{ insert: 'bar one, edited' }, { insert: '\n', attributes: { time: '8720' } }] }
    await store.saveScript('s1', edited)
    const body = uploadedBody()
    expect(body.timing).toEqual(timing)
    expect(body.someFutureField).toEqual([1, 2])
    expect(body.delta).toEqual(edited)
    expect(body.editTimestamp).toBeGreaterThan(1000)
  })

  it('a changed extra (timing edited in the timeline view) is what the next save sends', async () => {
    const store = await freshStore()
    await store.loadScript('s1', 's3://b/sessions/s1/script.json')
    const edited = { ...timing, sections: [] }
    store.setScriptExtra('s1', 'timing', edited)
    store.setScriptExtra('s1', 'delta', 'ignored') // the lyrics can't be replaced this way
    await store.saveScript('s1', timedDelta)
    expect(uploadedBody().timing).toEqual(edited)
    expect(uploadedBody().delta).toEqual(timedDelta)
    expect(uploadedBody().someFutureField).toEqual([1, 2])
  })

  it('a file without extras still saves as { delta, editTimestamp } only', async () => {
    api.downloadSessionScript.mockResolvedValue({ content: { delta: timedDelta, editTimestamp: 5 }, version: '"e1"' })
    const store = await freshStore()
    await store.loadScript('s1', 's3://b/sessions/s1/script.json')
    await store.saveScript('s1', timedDelta)
    expect(Object.keys(uploadedBody()).sort()).toEqual(['delta', 'editTimestamp'])
  })

  it('"use latest" on a conflict: the copy keeps this copy\'s extras, and later saves use the latest\'s', async () => {
    const store = await freshStore()
    await store.loadScript('s1', 's3://b/sessions/s1/script.json')
    const newerTiming = { ...timing, sections: [] }
    api.downloadSessionScript.mockResolvedValue({ content: { ...stored, timing: newerTiming }, version: '"e3"' })
    await store.resolveConflictUseLatest('s1', timedDelta)
    expect(uploadedBody(0).timing).toEqual(timing) // the "(my version)" copy
    await store.saveScript('s1', timedDelta)
    expect(uploadedBody(1).timing).toEqual(newerTiming)
  })
})

describe('encode/decode with extras', () => {
  it('round-trips extras, and known fields win over a stale extra of the same name', () => {
    const decoded = decodeServerScript(stored)
    expect(decoded.extras).toEqual({ timing, someFutureField: [1, 2] })
    const encoded = encodeServerScript(timedDelta, 2000, { ...decoded.extras, delta: 'stale', editTimestamp: 1 })
    expect(encoded).toEqual({ timing, someFutureField: [1, 2], delta: timedDelta, editTimestamp: 2000 })
  })

  it('legacy and plain files decode without an extras field', () => {
    expect(decodeServerScript(timedDelta)).toEqual({ delta: timedDelta, editTimestamp: 0 })
    expect(decodeServerScript({ delta: timedDelta, editTimestamp: 7 })).toEqual({ delta: timedDelta, editTimestamp: 7 })
  })
})
