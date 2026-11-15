import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'
import Quill from 'quill'

// --- Mocks ---
vi.mock('quill', () => ({
  default: vi.fn().mockImplementation(() => ({
    setContents: vi.fn(), getContents: vi.fn(() => ({ ops: [{ insert: 'test\n' }] })),
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

const mockRoute = { params: { id: 'session-1' } as Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute, onBeforeRouteLeave: vi.fn(),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

const mockIsOnline = ref(true)
vi.mock('@/composables/useConnectivity', () => ({
  useConnectivity: () => ({ isOnline: mockIsOnline, onReconnect: vi.fn(), offReconnect: vi.fn() }),
  reportNetworkError: vi.fn(), reportNetworkSuccess: vi.fn(),
}))
vi.mock('@/composables/useTimingMetrics', () => ({
  useTimingMetrics: () => ({ metrics: ref({}), recordAppLoadStart: vi.fn(),
    recordBeatAudible: vi.fn(), recordEditorFocused: vi.fn(), recordFirstSaveSuccess: vi.fn() }),
}))

const mockLocalDraftGet = vi.fn().mockResolvedValue(null)
vi.mock('@/services/localDraft', () => ({
  localDraftService: { get: (...a: unknown[]) => mockLocalDraftGet(...a),
    set: vi.fn().mockResolvedValue(undefined), delete: vi.fn(), isAvailable: () => true },
}))

const mockLoadSession = vi.fn()
let mockActiveSessionValue: any = null
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: () => ({ loadSession: (...a: unknown[]) => mockLoadSession(...a),
    saveScript: vi.fn().mockResolvedValue('url'), get activeSession() { return mockActiveSessionValue } }),
}))
vi.mock('@/stores/beatStore', () => ({ useBeatStore: () => ({ fetchBeats: vi.fn().mockResolvedValue([]) }) }))

import SessionEditorView from './SessionEditorView.vue'
const MockedQuill = vi.mocked(Quill)

// --- Tests ---
describe('SessionEditorView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockIsOnline.value = true
    mockActiveSessionValue = null
    mockLoadSession.mockReset()
    mockLocalDraftGet.mockResolvedValue(null)
    mockRoute.params = { id: 'session-1' }
    MockedQuill.mockClear()
  })

  async function mountAndSettle() {
    const w = mount(SessionEditorView, { global: { stubs: { RouterLink: true } } })
    await flushPromises(); await nextTick(); await flushPromises(); await nextTick()
    return w
  }

  // Validates: Requirements 3.2, 3.4
  it('transitions loading → ready on successful session load', async () => {
    mockLoadSession.mockImplementation(async () => {
      mockActiveSessionValue = { id: 'session-1', name: 'Test Session', script: null, beatUrl: '/beats/t.wav' }
    })
    const w = await mountAndSettle()
    expect(w.text()).toContain('Test Session')
    expect(MockedQuill).toHaveBeenCalled()
  })

  // Validates: Requirement 9.3 (Last_Write_Wins — local newer wins)
  it('uses local draft delta when its timestamp is newer than server', async () => {
    const localDelta = { ops: [{ insert: 'local wins\n' }] }
    mockLocalDraftGet.mockResolvedValue({ sessionId: 'session-1', delta: localDelta,
      editTimestamp: 2000, cursorPosition: 5, beatPlaybackPosition: 0, beatVolume: 0.8, beatLooping: false })
    const serverPayload = JSON.stringify({ delta: { ops: [{ insert: 'server\n' }] }, editTimestamp: 1000 })
    mockLoadSession.mockImplementation(async () => {
      mockActiveSessionValue = { id: 'session-1', name: 'S', script: `data:application/json;base64,${btoa(serverPayload)}`, beatUrl: '/beats/t.wav' }
    })
    await mountAndSettle()
    const q = MockedQuill.mock.results[0]?.value as any
    expect(q.setContents).toHaveBeenCalledWith(localDelta)
  })

  // Validates: Requirement 11.2 (Error state + retry)
  it('shows error state with retry when session fails to load', async () => {
    mockLoadSession.mockRejectedValue(new Error('Network error'))
    const w = await mountAndSettle()
    expect(w.text()).toContain('Failed to load session')
    expect(w.find('button').text()).toContain('Retry')
  })

  // Validates: Requirement 11.5 (Offline indicator)
  it('shows offline indicator when connectivity is lost', async () => {
    mockIsOnline.value = false
    mockLoadSession.mockImplementation(async () => {
      mockActiveSessionValue = { id: 'session-1', name: 'S', script: null, beatUrl: '/beats/t.wav' }
    })
    const w = await mountAndSettle()
    expect(w.text()).toContain('Offline')
  })

  // Validates: Requirements 11.1 (Empty state)
  it('shows empty state when no session id in route', async () => {
    mockRoute.params = { id: '' }
    const w = await mountAndSettle()
    expect(w.text()).toContain('No Song Selected')
  })
})
