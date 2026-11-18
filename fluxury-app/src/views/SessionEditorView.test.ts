import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive, ref } from 'vue'
import Quill from 'quill'

// --- Mocks ---
vi.mock('quill', () => ({
  default: vi.fn().mockImplementation(() => ({
    root: document.createElement('div'), // Quill's contenteditable element
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

const mockPush = vi.fn()
const mockRoute = { params: { id: 'session-1' } as Record<string, string> }
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute, useRouter: () => ({ push: mockPush }), onBeforeRouteLeave: vi.fn(),
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

let mockConflictSessionId: string | null = null
const mockLoadSession = vi.fn()
let mockActiveSessionValue: any = null
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: () => ({ loadSession: (...a: unknown[]) => mockLoadSession(...a),
    loadScript: async (_id: string, script?: string) =>
      script?.startsWith('data:application/json;base64,') ? JSON.parse(atob(script.split(',')[1])) : null,
    get conflictSessionId() { return mockConflictSessionId },
    saveScript: vi.fn().mockResolvedValue('url'), get activeSession() { return mockActiveSessionValue } }),
}))
const mockBeatStore = reactive({
  beats: [] as Array<{ id: string; path: string }>,
  fetchBeats: vi.fn().mockResolvedValue(undefined),
})
vi.mock('@/stores/beatStore', () => ({ useBeatStore: () => mockBeatStore }))

import SessionEditorView from './SessionEditorView.vue'
import { useAuthStore } from '@/stores/authStore'
import { useSessionDeletionStore } from '@/stores/sessionDeletionStore'
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

  // Validates: Requirement 9.3 (Last_Write_Wins — unsynced local edits newer than server win)
  it('uses an unsynced local draft when its timestamp is newer than server', async () => {
    const localDelta = { ops: [{ insert: 'local wins\n' }] }
    mockLocalDraftGet.mockResolvedValue({ sessionId: 'session-1', delta: localDelta, synced: false,
      editTimestamp: 2000, cursorPosition: 5, beatPlaybackPosition: 0, beatVolume: 0.8, beatLooping: false })
    const serverPayload = JSON.stringify({ delta: { ops: [{ insert: 'server\n' }] }, editTimestamp: 1000 })
    mockLoadSession.mockImplementation(async () => {
      mockActiveSessionValue = { id: 'session-1', name: 'S', script: `data:application/json;base64,${btoa(serverPayload)}`, beatUrl: '/beats/t.wav' }
    })
    await mountAndSettle()
    const q = MockedQuill.mock.results[0]?.value as any
    expect(q.setContents).toHaveBeenCalledWith(localDelta)
  })

  it('ignores a synced local draft and shows the server copy (saved elsewhere)', async () => {
    const serverDelta = { ops: [{ insert: 'server\n' }] }
    mockLocalDraftGet.mockResolvedValue({ sessionId: 'session-1', delta: { ops: [{ insert: 'old\n' }] }, synced: true,
      editTimestamp: 9000, cursorPosition: 5, beatPlaybackPosition: 0, beatVolume: 0.8, beatLooping: false })
    const serverPayload = JSON.stringify({ delta: serverDelta, editTimestamp: 1000 })
    mockLoadSession.mockImplementation(async () => {
      mockActiveSessionValue = { id: 'session-1', name: 'S', script: `data:application/json;base64,${btoa(serverPayload)}`, beatUrl: '/beats/t.wav' }
    })
    await mountAndSettle()
    const q = MockedQuill.mock.results[0]?.value as any
    expect(q.setContents).toHaveBeenCalledWith(serverDelta)
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

describe('SessionEditorView: session options menu (delete)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockIsOnline.value = true
    mockLocalDraftGet.mockResolvedValue(null)
    mockRoute.params = { id: 'session-1' }
    mockPush.mockReset()
    mockLoadSession.mockReset().mockImplementation(async () => {
      mockActiveSessionValue = { id: 'session-1', name: 'Verse one', script: null, beatUrl: '/beats/t.wav' }
    })
  })

  async function mountSignedIn(signedIn = true) {
    useAuthStore().isAuthenticated = signedIn
    const w = mount(SessionEditorView, { attachTo: document.body, global: { stubs: { RouterLink: true } } })
    await flushPromises(); await nextTick(); await flushPromises(); await nextTick()
    return w
  }

  it('is closed until the ⋯ button is pressed', async () => {
    const w = await mountSignedIn()
    const toggle = w.find('[data-testid="session-menu"]')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(w.find('[data-testid="delete-session"]').exists()).toBe(false)

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(w.find('[role="menu"] [data-testid="delete-session"]').text()).toContain('Delete session')
    w.unmount()
  })

  it('Delete session starts an undoable delete and goes back to the list', async () => {
    const w = await mountSignedIn()
    await w.find('[data-testid="session-menu"]').trigger('click')
    await w.find('[data-testid="delete-session"]').trigger('click')

    expect(useSessionDeletionStore().pending).toEqual({ id: 'session-1', name: 'Verse one' })
    expect(mockPush).toHaveBeenCalledWith('/sessions')
    w.unmount()
  })

  it('Escape closes the menu without deleting', async () => {
    const w = await mountSignedIn()
    await w.find('[data-testid="session-menu"]').trigger('click')
    await w.find('[role="menu"]').trigger('keydown', { key: 'Escape' })

    expect(w.find('[role="menu"]').exists()).toBe(false)
    expect(useSessionDeletionStore().pending).toBeNull()
    w.unmount()
  })

  it('a tap outside closes the menu', async () => {
    const w = await mountSignedIn()
    await w.find('[data-testid="session-menu"]').trigger('click')
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()

    expect(w.find('[role="menu"]').exists()).toBe(false)
    w.unmount()
  })

  it('during a save conflict, a signed-in writer is not told to sign in', async () => {
    mockConflictSessionId = 'session-1'
    const w = await mountSignedIn()
    expect(w.find('[data-testid="conflict-banner"]').exists()).toBe(true)
    // RouterLink is stubbed (no slot text), so look for the link itself
    expect(w.find('[to="/login"]').exists()).toBe(false)
    mockConflictSessionId = null
    w.unmount()
  })

  it('is not offered to signed-out viewers', async () => {
    const w = await mountSignedIn(false)
    expect(w.find('[data-testid="session-menu"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('SessionEditorView: opening a session (no flash of empty or wrong content)', () => {
  /** A promise the test resolves by hand, to hold the UI in its loading state. */
  function deferred<T = void>() {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    return { promise, resolve }
  }

  const settle = async () => { await flushPromises(); await nextTick(); await flushPromises(); await nextTick() }
  const mountEditor = async () => {
    const w = mount(SessionEditorView, { global: { stubs: { RouterLink: true } } })
    await settle()
    return w
  }
  const loadsAs = (s: Record<string, unknown>) => mockLoadSession.mockImplementation(async () => {
    mockActiveSessionValue = { id: 'session-1', name: 'Verse one', script: null, ...s }
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    mockIsOnline.value = true
    mockLocalDraftGet.mockResolvedValue(null)
    mockRoute.params = { id: 'session-1' }
    mockActiveSessionValue = null
    mockLoadSession.mockReset()
    mockBeatStore.beats = []
    mockBeatStore.fetchBeats.mockReset().mockResolvedValue(undefined)
    MockedQuill.mockClear()
  })

  it('the very first render is the skeleton (before onMounted has started loading)', () => {
    mockLoadSession.mockReturnValue(deferred().promise)
    const w = mount(SessionEditorView, { global: { stubs: { RouterLink: true } } })

    // Synchronously after mount: the DOM is still the initial render.
    expect(w.find('[data-testid="session-skeleton"]').exists()).toBe(true)
    expect(w.find('[data-testid="script-editor"]').exists()).toBe(false)
    w.unmount()
  })

  it('shows a skeleton of the editor, never an empty editor, until the session arrives', async () => {
    const pending = deferred()
    mockLoadSession.mockImplementation(async () => {
      await pending.promise
      mockActiveSessionValue = { id: 'session-1', name: 'Verse one', script: null }
    })
    const w = await mountEditor()

    expect(w.find('[data-testid="session-skeleton"]').exists()).toBe(true)
    expect(w.find('[data-testid="session-skeleton"]').attributes('aria-busy')).toBe('true')
    expect(w.find('[data-testid="script-editor"]').exists()).toBe(false)
    expect(w.text()).not.toContain('No beat selected')
    expect(w.text()).not.toContain('No Song Selected')

    pending.resolve()
    await settle()
    expect(w.find('[data-testid="session-skeleton"]').exists()).toBe(false)
    expect(w.find('[data-testid="script-editor"]').exists()).toBe(true)
    expect(w.text()).toContain('Verse one')
  })

  it('starts loading the session without waiting for the beat list', async () => {
    mockBeatStore.fetchBeats.mockReturnValue(deferred().promise) // never resolves
    loadsAs({})
    const w = await mountEditor()

    expect(mockLoadSession).toHaveBeenCalledWith('session-1')
    expect(w.find('[data-testid="script-editor"]').exists()).toBe(true)
  })

  it('while the beat list loads, a session with a beat shows a player placeholder, not "No beat"', async () => {
    const beats = deferred()
    mockBeatStore.fetchBeats.mockReturnValue(beats.promise)
    loadsAs({ beatId: 'beat-1' })
    const w = await mountEditor()

    expect(w.find('[data-testid="player-skeleton"]').exists()).toBe(true)
    expect(w.text()).not.toContain('No beat selected')
    expect(w.text()).not.toContain('No Song Selected')

    mockBeatStore.beats = [{ id: 'beat-1', path: '/beats/beat-1.wav' }]
    beats.resolve()
    await settle()
    expect(w.find('[data-testid="player-skeleton"]').exists()).toBe(false)
    expect(w.text()).not.toContain('No beat selected')
  })

  it('a session without a beat says so straight away, with no empty player bar', async () => {
    mockBeatStore.fetchBeats.mockReturnValue(deferred().promise) // irrelevant: no beat to look up
    loadsAs({})
    const w = await mountEditor()

    expect(w.text()).toContain('No beat selected')
    expect(w.find('[data-testid="player-skeleton"]').exists()).toBe(false)
    expect(w.text()).not.toContain('No Song Selected')
  })

  it('a beat that no longer exists counts as no beat once the list has loaded', async () => {
    mockBeatStore.beats = [{ id: 'other', path: '/beats/other.wav' }]
    loadsAs({ beatId: 'deleted-beat' })
    const w = await mountEditor()

    expect(w.find('[data-testid="player-skeleton"]').exists()).toBe(false)
    expect(w.text()).toContain('No beat selected')
  })
})

describe('SessionEditorView: the space bar works everywhere', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockIsOnline.value = true
    mockLocalDraftGet.mockResolvedValue(null)
    mockRoute.params = { id: 'session-1' }
    mockBeatStore.fetchBeats.mockReset().mockResolvedValue(undefined)
    mockLoadSession.mockReset().mockImplementation(async () => {
      mockActiveSessionValue = { id: 'session-1', name: 'Verse one', script: null }
    })
  })

  async function mountSignedIn() {
    useAuthStore().isAuthenticated = true
    const w = mount(SessionEditorView, { attachTo: document.body, global: { stubs: { RouterLink: true } } })
    await flushPromises(); await nextTick(); await flushPromises(); await nextTick()
    return w
  }

  /** Press Space on an element the way a browser would; true if anything blocked it. */
  function spaceIsBlocked(el: Element): boolean {
    const e = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })
    el.dispatchEvent(e)
    return e.defaultPrevented
  }

  it('lets you type spaces in the session title (regression)', async () => {
    const w = await mountSignedIn()
    await w.find('h1').trigger('click')
    const title = w.find('input')
    expect(title.exists()).toBe(true)

    expect(spaceIsBlocked(title.element)).toBe(false)
    w.unmount()
  })

  it('lets Space press a focused button (keyboard users)', async () => {
    const w = await mountSignedIn()
    expect(spaceIsBlocked(w.find('[data-testid="session-menu"]').element)).toBe(false)
    w.unmount()
  })
})

describe('SessionEditorView: keyboard for writing lyrics', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockIsOnline.value = true
    mockLocalDraftGet.mockResolvedValue(null)
    mockRoute.params = { id: 'session-1' }
    mockBeatStore.fetchBeats.mockReset().mockResolvedValue(undefined)
    MockedQuill.mockClear()
    mockLoadSession.mockReset().mockImplementation(async () => {
      mockActiveSessionValue = { id: 'session-1', name: 'Verse one', script: null }
    })
  })

  it('turns autocorrect off, so slang and deliberate spellings are not "fixed"', async () => {
    useAuthStore().isAuthenticated = true
    mount(SessionEditorView, { global: { stubs: { RouterLink: true } } })
    await flushPromises(); await nextTick(); await flushPromises(); await nextTick()

    const root: HTMLElement = (MockedQuill.mock.results[0]?.value as any).root
    expect(root.getAttribute('autocorrect')).toBe('off')
    // Suggestions stay: spellcheck isn't turned off (that may hide the suggestion bar)
    expect(root.getAttribute('spellcheck')).not.toBe('false')
  })
})
