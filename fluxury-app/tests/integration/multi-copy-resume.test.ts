/**
 * Integration: one session open in many places (devices, tabs, windows).
 *
 * Real SessionEditorView + real useAutosave + real sessionStore + real
 * S3Service + real localDraftService. Faked only at the edges: S3, the
 * sessions API, and IndexedDB (one per "device"; "tabs" in one browser share
 * one).
 *
 * Regressions for: a device that had ever edited a session showed ITS OWN old
 * draft on reopen, and the next keystroke saved it over newer work; and a copy
 * left open with stale content saving over newer work (conflict detection).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.stubEnv('VITE_S3_BUCKET_NAME', 'test-bucket')

// --- Fake S3 with ETags and conditional writes (If-Match / If-None-Match),
// refusing with 412 PreconditionFailed like real S3 ---
const bucket = new Map<string, { body: string; etag: string }>()
let etagCounter = 0
let s3Offline = false
vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand { constructor(public input: any) {} }
  class GetObjectCommand { constructor(public input: any) {} }
  const preconditionFailed = () =>
    Object.assign(new Error('PreconditionFailed'), { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } })
  class S3Client {
    async send(cmd: any) {
      if (s3Offline) throw new TypeError('Failed to fetch')
      const key = `${cmd.input.Bucket}/${cmd.input.Key}`
      const current = bucket.get(key)
      if (cmd instanceof PutObjectCommand) {
        const { IfMatch, IfNoneMatch } = cmd.input
        if (IfMatch !== undefined && current?.etag !== IfMatch) throw preconditionFailed()
        if (IfNoneMatch === '*' && current) throw preconditionFailed()
        const etag = `"e${++etagCounter}"`
        bucket.set(key, { body: String(cmd.input.Body), etag })
        return { ETag: etag }
      }
      if (!current) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })
      return { ETag: current.etag, Body: { transformToString: async () => current.body } }
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand }
})
const storedText = (id: string) => {
  const obj = bucket.get(`test-bucket/sessions/${id}/script.json`)
  return obj ? text(JSON.parse(obj.body).delta) : undefined
}
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: async () => ({ credentials: { accessKeyId: 'a', secretAccessKey: 'b', sessionToken: 'c' } }),
}))

// --- Fake sessions API (stores fields verbatim, like the Lambda) ---
const sessionsDb = new Map<string, any>()
vi.mock('@/services/api', async () => {
  const { S3Service } = await import('@/services/s3Service')
  return {
    sessionsApi: {
      getSession: async (id: string) => ({ data: { ...sessionsDb.get(id) } }),
      updateSession: async (id: string, payload: any) => {
        sessionsDb.set(id, { ...sessionsDb.get(id), ...payload })
        return { data: sessionsDb.get(id) }
      },
      listSessions: async () => ({ data: { sessions: [...sessionsDb.values()] } }),
      createSession: async (payload: any) => {
        const session = { id: `copy-${sessionsDb.size}`, script: '', artworkUrl: '', ...payload }
        sessionsDb.set(session.id, session)
        return { data: session }
      },
    },
    storageApi: {
      uploadSessionScript: S3Service.uploadSessionScript,
      downloadSessionScript: S3Service.downloadSessionScript,
    },
    beatsApi: {}, authApi: {},
  }
})

// --- Local drafts: the REAL localDraftService on fake IndexedDB. Each device
// gets its own IDBFactory; tabs in one browser share one. fake-indexeddb uses
// real structured-clone semantics, so it rejects what a browser rejects. ---
import { IDBFactory } from 'fake-indexeddb'
type Store = IDBFactory

// --- Quill fake that lets the test type ---
let editors: Array<{ shown: any; type: (text: string) => void }> = []
vi.mock('quill', () => ({
  default: vi.fn().mockImplementation(() => {
    let contents: any = { ops: [{ insert: '\n' }] }
    const handlers: Record<string, () => void> = {}
    const editor = {
      shown: null as any,
      type: (text: string) => { contents = { ops: [{ insert: `${text}\n` }] }; handlers['text-change']?.() },
    }
    editors.push(editor)
    return {
      setContents: (delta: any) => { contents = delta; editor.shown = delta },
      getContents: () => contents,
      on: (evt: string, cb: () => void) => { handlers[evt] = cb },
      getSelection: () => ({ index: 0 }), setSelection: vi.fn(), getLength: () => 1,
      focus: vi.fn(), disable: vi.fn(), enable: vi.fn(),
    }
  }),
}))
vi.mock('quill/dist/quill.snow.css', () => ({}))
vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation(() => ({ play: vi.fn(), pause: vi.fn(), stop: vi.fn(), seek: vi.fn(() => 0),
    volume: vi.fn(() => 0.8), loop: vi.fn(() => true), duration: vi.fn(() => 200), playing: vi.fn(() => false), unload: vi.fn() })),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'song-1' } }), useRouter: () => ({ push: vi.fn() }), onBeforeRouteLeave: vi.fn(),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))
vi.mock('@/composables/useConnectivity', async () => {
  const { ref } = await import('vue')
  return { useConnectivity: () => ({ isOnline: ref(true), onReconnect: vi.fn(), offReconnect: vi.fn() }),
    reportNetworkError: vi.fn(), reportNetworkSuccess: vi.fn() }
})
vi.mock('@/composables/useTimingMetrics', async () => {
  const { ref } = await import('vue')
  return { useTimingMetrics: () => ({ metrics: ref({}), recordAppLoadStart: vi.fn(), recordBeatAudible: vi.fn(),
    recordEditorFocused: vi.fn(), recordFirstSaveSuccess: vi.fn() }) }
})
vi.mock('@/stores/beatStore', () => ({ useBeatStore: () => ({ beats: [], fetchBeats: vi.fn().mockResolvedValue([]) }) }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ isAuthenticated: true }) }))

/**
 * Advance fake time while letting fake-indexeddb's real setImmediate callbacks
 * run, so IndexedDB requests and timers interleave like they do in a browser.
 */
async function settle(ms: number, step = 50) {
  for (let t = 0; t < ms; t += step) {
    await new Promise((resolve) => setImmediate(resolve))
    await vi.advanceTimersByTimeAsync(step)
  }
  await new Promise((resolve) => setImmediate(resolve))
  await flushPromises()
}

const text = (delta: any) => delta?.ops?.map((op: any) => op.insert).join('').trim()

/** Open the session in a copy that uses `store` for local drafts. */
async function open(store: Store) {
  // A fresh module graph = a fresh page load, so the draft service opens this
  // copy's IndexedDB instead of reusing the previous copy's connection.
  globalThis.indexedDB = store
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { default: SessionEditorView } = await import('@/views/SessionEditorView.vue')
  const editorsBefore = editors.length
  const wrapper = mount(SessionEditorView, { global: { stubs: { RouterLink: true } } })
  await settle(300)
  if (editors.length === editorsBefore) throw new Error('editor never mounted (session load stuck)')
  const editor = editors[editors.length - 1]
  return {
    shownText: () => text(editor.shown),
    /** Type, then let the local draft write (500ms) and the debounced save (1.5s) run. */
    async write(lyrics: string) {
      editor.type(lyrics)
      await settle(2500)
    },
    inConflict: () => wrapper.find('[data-testid="conflict-banner"]').exists(),
    async click(testId: string) {
      await wrapper.find(`[data-testid="${testId}"]`).trigger('click')
      await settle(2500)
    },
    note: () => wrapper.find('[data-testid="conflict-note"]').text(),
    close: () => wrapper.unmount(),
  }
}

describe('Integration: one session open in many places', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'))
    bucket.clear(); etagCounter = 0; sessionsDb.clear(); editors = []; s3Offline = false
    sessionsDb.set('song-1', { id: 'song-1', name: 'Song', artworkUrl: '', script: '' })
  })
  afterEach(() => { vi.useRealTimers() })

  it('device A reopens and shows the newer work saved on device B', async () => {
    const deviceA: Store = new IDBFactory()
    const deviceB: Store = new IDBFactory()

    const a1 = await open(deviceA)
    await a1.write('monday bars')
    a1.close()

    vi.advanceTimersByTime(24 * 3600_000)
    const b = await open(deviceB)
    expect(b.shownText()).toBe('monday bars')
    await b.write('tuesday bars')
    b.close()

    vi.advanceTimersByTime(24 * 3600_000)
    const a2 = await open(deviceA)
    expect(a2.shownText()).toBe('tuesday bars')
    a2.close()
  })

  it('two tabs sharing one browser store both see the latest save', async () => {
    const browser: Store = new IDBFactory()

    const tab1 = await open(browser)
    await tab1.write('v1')
    tab1.close()

    const tab2 = await open(browser)
    expect(tab2.shownText()).toBe('v1')
    await tab2.write('v2')
    tab2.close()

    const tab1Again = await open(browser)
    expect(tab1Again.shownText()).toBe('v2')
    tab1Again.close()
  })

  it('unsynced work from a failed save is restored on that copy, not discarded', async () => {
    const device: Store = new IDBFactory()
    const first = await open(device)
    await first.write('saved line')
    s3Offline = true
    await first.write('written while offline')
    first.close()

    s3Offline = false
    const reopened = await open(device)
    expect(reopened.shownText()).toBe('written while offline')
    reopened.close()
  })

  it('unsynced work on one device does not override newer work saved elsewhere later', async () => {
    const deviceA: Store = new IDBFactory()
    const deviceB: Store = new IDBFactory()

    const a = await open(deviceA)
    s3Offline = true
    await a.write('stuck offline on A')
    a.close()
    s3Offline = false

    vi.advanceTimersByTime(3600_000)
    const b = await open(deviceB)
    await b.write('newer from B')
    b.close()

    const aAgain = await open(deviceA)
    expect(aAgain.shownText()).toBe('newer from B')
    aAgain.close()
  })

  describe('copies open at the same time (conflict detection)', () => {
    /** Laptop and phone both have the session open; the phone saves first. */
    async function laptopFallsBehind() {
      const laptop = await open(new IDBFactory())
      await laptop.write('first draft')
      const phone = await open(new IDBFactory())
      await phone.write('phone bars')
      await laptop.write('laptop bars')
      return { laptop, phone }
    }

    it('refuses the stale save instead of overwriting, and asks the user', async () => {
      const { laptop, phone } = await laptopFallsBehind()
      expect(storedText('song-1')).toBe('phone bars')
      expect(laptop.inConflict()).toBe(true)
      expect(phone.inConflict()).toBe(false)
      laptop.close(); phone.close()
    })

    it('keeps saving paused while in conflict', async () => {
      const { laptop, phone } = await laptopFallsBehind()
      await laptop.write('laptop bars, more')
      expect(storedText('song-1')).toBe('phone bars')
      laptop.close(); phone.close()
    })

    it('"Keep my version" saves this copy over the newer one', async () => {
      const { laptop, phone } = await laptopFallsBehind()
      await laptop.click('conflict-keep-mine')
      expect(laptop.inConflict()).toBe(false)
      expect(storedText('song-1')).toBe('laptop bars')
      laptop.close(); phone.close()
    })

    it('"Use the latest version" loads it and keeps this copy as a new session', async () => {
      const { laptop, phone } = await laptopFallsBehind()
      await laptop.click('conflict-use-latest')
      expect(laptop.inConflict()).toBe(false)
      expect(laptop.shownText()).toBe('phone bars')
      expect(storedText('song-1')).toBe('phone bars')
      expect(storedText('copy-1')).toBe('laptop bars')
      expect(sessionsDb.get('copy-1').name).toBe('Song (my version)')
      expect(laptop.note()).toContain('Song (my version)')
      laptop.close(); phone.close()
    })

    it('after resolving, the other copy is now the one behind', async () => {
      const { laptop, phone } = await laptopFallsBehind()
      await laptop.click('conflict-keep-mine')
      await phone.write('phone again')
      expect(phone.inConflict()).toBe(true)
      expect(storedText('song-1')).toBe('laptop bars')
      laptop.close(); phone.close()
    })

    it('two copies of a brand-new session: the second first-save is refused', async () => {
      const a = await open(new IDBFactory())
      const b = await open(new IDBFactory())
      await a.write('from A')
      await b.write('from B')
      expect(storedText('song-1')).toBe('from A')
      expect(b.inConflict()).toBe(true)
      a.close(); b.close()
    })
  })
})
