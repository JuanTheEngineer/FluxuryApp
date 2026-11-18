/**
 * Integration: save -> reopen round trip against the REAL-mode data contract.
 *
 * Uses the real sessionStore, real S3Service and real SessionEditorView.
 * Only the network edges are faked, each behaving like production:
 *   - S3 (in-memory bucket)
 *   - Sessions API (stores `script` verbatim, like the Lambda's UpdateExpression)
 *
 * Regression for: lyrics save ("saved just now") but are gone on reopen,
 * because save stores an `s3://` URL and load only understood `data:` URLs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.stubEnv('VITE_S3_BUCKET_NAME', 'test-bucket')

// --- Fake S3 (in-memory) ---
const bucket = new Map<string, string>()
let failPut = false
vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand { constructor(public input: any) {} }
  class GetObjectCommand { constructor(public input: any) {} }
  class S3Client {
    async send(cmd: any) {
      if (cmd instanceof PutObjectCommand) {
        if (failPut) throw new Error('AccessDenied')
        bucket.set(`${cmd.input.Bucket}/${cmd.input.Key}`, String(cmd.input.Body))
        return {}
      }
      const body = bucket.get(`${cmd.input.Bucket}/${cmd.input.Key}`)
      return { Body: body === undefined ? undefined : { transformToString: async () => body } }
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand }
})
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: async () => ({
    credentials: { accessKeyId: 'a', secretAccessKey: 'b', sessionToken: 'c' },
  }),
}))

// --- Fake Sessions API: behaves like sessions.ts Lambda (stores fields verbatim) ---
const sessionsDb = new Map<string, any>()
vi.mock('@/services/api', async () => {
  const { S3Service } = await import('@/services/s3Service')
  return {
    sessionsApi: {
      getSession: async (id: string) => ({ data: { ...sessionsDb.get(id) } }),
      updateSession: async (id: string, payload: any) => {
        const next = { ...sessionsDb.get(id), ...payload }
        sessionsDb.set(id, next)
        return { data: next }
      },
      listSessions: async () => ({ data: { sessions: [...sessionsDb.values()] } }),
    },
    storageApi: {
      uploadSessionScript: S3Service.uploadSessionScript,
      downloadSessionScript: S3Service.downloadSessionScript,
    },
    beatsApi: {},
    authApi: {},
  }
})

// --- View-level mocks (same as SessionEditorView.test.ts) ---
vi.mock('quill', () => ({
  default: vi.fn().mockImplementation(() => ({
    root: document.createElement('div'),
    setContents: vi.fn(), getContents: vi.fn(() => ({ ops: [{ insert: 'x\n' }] })),
    setSelection: vi.fn(), getLength: vi.fn(() => 5), focus: vi.fn(), on: vi.fn(), disable: vi.fn(), enable: vi.fn(),
  })),
}))
vi.mock('quill/dist/quill.snow.css', () => ({}))
vi.mock('howler', () => ({
  Howl: vi.fn().mockImplementation((c) => {
    setTimeout(() => c.onload?.(), 0)
    return { play: vi.fn(), pause: vi.fn(), stop: vi.fn(), seek: vi.fn(() => 0),
      volume: vi.fn(() => 0.8), loop: vi.fn(() => true), duration: vi.fn(() => 200),
      playing: vi.fn(() => false), unload: vi.fn() }
  }),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'session-1' } }),
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))
vi.mock('@/composables/useConnectivity', async () => {
  const { ref } = await import('vue')
  return {
    useConnectivity: () => ({ isOnline: ref(true), onReconnect: vi.fn(), offReconnect: vi.fn() }),
    reportNetworkError: vi.fn(), reportNetworkSuccess: vi.fn(),
  }
})
vi.mock('@/composables/useTimingMetrics', async () => {
  const { ref } = await import('vue')
  return {
    useTimingMetrics: () => ({ metrics: ref({}), recordAppLoadStart: vi.fn(),
      recordBeatAudible: vi.fn(), recordEditorFocused: vi.fn(), recordFirstSaveSuccess: vi.fn() }),
  }
})
// No local draft: the server copy must be the source of truth on reopen.
vi.mock('@/services/localDraft', () => ({
  localDraftService: { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(), isAvailable: () => true },
}))
vi.mock('@/stores/beatStore', () => ({ useBeatStore: () => ({ fetchBeats: vi.fn().mockResolvedValue([]) }) }))

// The global setup (tests/setup.ts) already loaded '@/services/api' in demo mode.
// Reset the module graph and import fresh so the store/view bind to the fakes above.
async function loadModules() {
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSessionStore } = await import('@/stores/sessionStore')
  const { default: SessionEditorView } = await import('@/views/SessionEditorView.vue')
  const { default: Quill } = await import('quill')
  return { useSessionStore, SessionEditorView, MockedQuill: vi.mocked(Quill) }
}

const lyrics = { ops: [{ insert: 'first bar, second bar\n' }] }

describe('Integration: save -> reopen (real-mode contract)', () => {
  beforeEach(() => {
    bucket.clear()
    sessionsDb.clear()
    failPut = false
    sessionsDb.set('session-1', { id: 'session-1', name: 'S', artworkUrl: '', script: '' })
  })

  it('lyrics saved via saveScript are loaded back into the editor on reopen', async () => {
    const { useSessionStore, SessionEditorView, MockedQuill } = await loadModules()
    const store = useSessionStore()
    await store.loadSession('session-1')
    const saved = await store.saveScript('session-1', lyrics)
    expect(saved).not.toBeNull()

    // "Reopen": fresh pinia + fresh view, only server state survives.
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const w = mount(SessionEditorView, { global: { stubs: { RouterLink: true } } })
    await flushPromises(); await nextTick(); await flushPromises(); await nextTick()

    const q = MockedQuill.mock.results[0]?.value as any
    expect(q.setContents).toHaveBeenCalledWith(lyrics)
    w.unmount()
  })

  it('saveScript surfaces failure instead of reporting success when the upload fails', async () => {
    failPut = true
    const { useSessionStore } = await loadModules()
    const store = useSessionStore()
    await store.loadSession('session-1')
    // Autosave treats a resolved promise as "saved", so a failed upload must reject.
    await expect(store.saveScript('session-1', lyrics)).rejects.toThrow()
  })
})
