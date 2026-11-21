import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}))

const store = reactive({
  sessions: [] as any[],
  error: null as string | null,
  fetchSessions: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn<(id: string) => Promise<boolean>>(),
})
vi.mock('@/stores/sessionStore', () => ({ useSessionStore: () => store }))
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => ({ isAuthenticated: true }) }))

import SessionBrowserView from './SessionBrowserView.vue'
import { useSessionDeletionStore } from '@/stores/sessionDeletionStore'

const session = (id: string, name: string, modified: string) => ({ id, name, author: '', created: modified, modified })

async function mountList() {
  const w = mount(SessionBrowserView, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  return w
}
const names = (w: any) => w.findAll('[data-testid="session-card"] h3').map((h: any) => h.text())
const resumeCard = (w: any) => w.find('.bg-surface-elevated.border.rounded-xl.p-4')

/** What the editor's ⋯ → Delete session does before navigating to the list. */
const deleteFromEditor = (id: string, name: string) => useSessionDeletionStore().request({ id, name })

describe('SessionBrowserView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    push.mockReset()
    store.sessions = [session('s1', 'Verse one', '2026-11-17T10:00:00Z'), session('s2', 'Hook', '2026-11-16T10:00:00Z')]
    store.deleteSession.mockReset().mockImplementation(async (id: string) => {
      store.sessions = store.sessions.filter((s) => s.id !== id)
      return true
    })
  })
  afterEach(() => vi.useRealTimers())

  it('has no delete controls on the cards (delete lives in the editor)', async () => {
    const w = await mountList()
    expect(w.findAll('[data-testid="session-card"]')).toHaveLength(2)
    expect(w.find('[data-testid="session-card"] button').exists()).toBe(false)
  })

  describe('after deleting from the editor', () => {
    it('hides the session and offers Undo, without deleting yet', async () => {
      deleteFromEditor('s1', 'Verse one')
      const w = await mountList()

      expect(names(w)).toEqual(['Hook'])
      expect(w.find('[data-testid="delete-status"]').text()).toContain('Deleted “Verse one”')
      expect(store.deleteSession).not.toHaveBeenCalled()
    })

    it('Undo brings it back and nothing is deleted', async () => {
      deleteFromEditor('s1', 'Verse one')
      const w = await mountList()
      await w.find('[data-testid="undo-delete"]').trigger('click')
      await vi.advanceTimersByTimeAsync(10_000)

      expect(names(w)).toEqual(['Verse one', 'Hook'])
      expect(store.deleteSession).not.toHaveBeenCalled()
      expect(w.find('[data-testid="delete-status"]').exists()).toBe(false)
    })

    it('deletes after 5 seconds and the bar goes away', async () => {
      deleteFromEditor('s1', 'Verse one')
      const w = await mountList()
      await vi.advanceTimersByTimeAsync(5000)

      expect(store.deleteSession).toHaveBeenCalledWith('s1')
      expect(names(w)).toEqual(['Hook'])
      expect(w.find('[data-testid="delete-status"]').exists()).toBe(false)
    })

    it('a failed delete brings the session back and says so', async () => {
      store.deleteSession.mockResolvedValue(false)
      deleteFromEditor('s1', 'Verse one')
      const w = await mountList()
      await vi.advanceTimersByTimeAsync(5000)

      expect(names(w)).toEqual(['Verse one', 'Hook'])
      expect(w.find('[data-testid="delete-status"]').text()).toContain("Couldn't delete “Verse one”")
    })

    it('leaving the list commits the pending delete immediately', async () => {
      deleteFromEditor('s1', 'Verse one')
      const w = await mountList()
      w.unmount()
      await flushPromises()

      expect(store.deleteSession).toHaveBeenCalledWith('s1')
    })

    it('the resume card skips the session being deleted', async () => {
      deleteFromEditor('s1', 'Verse one')
      const w = await mountList()

      expect(resumeCard(w).text()).toContain('Hook')
      expect(resumeCard(w).text()).not.toContain('Verse one')
    })
  })

  it('the resume card offers the most recently edited session, whatever the API order', async () => {
    store.sessions = [
      session('old', 'Old song', '2026-01-01T10:00:00Z'),
      session('new', 'New song', '2026-11-17T10:00:00Z'),
      session('mid', 'Mid song', '2026-06-01T10:00:00Z'),
    ]
    const w = await mountList()
    expect(resumeCard(w).text()).toContain('New song')
    expect(names(w)).toEqual(['New song', 'Mid song', 'Old song'])
  })
})

describe('SessionBrowserView first load (no empty-account flash)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    store.sessions = []
    store.error = null
    ;(store as any).sessionsLoaded = false
  })

  it('shows placeholders, not "No sessions yet", while the list is still loading', async () => {
    const w = await mountList()
    expect(w.find('[data-testid="sessions-loading"]').exists()).toBe(true)
    expect(w.text()).not.toContain('No sessions yet')
    expect(w.find('input').exists()).toBe(false) // nothing to search yet
  })

  it('shows the cards once they arrive', async () => {
    const w = await mountList()
    store.sessions = [session('s1', 'Verse one', '2026-11-17T10:00:00Z')]
    ;(store as any).sessionsLoaded = true
    await flushPromises()
    expect(w.find('[data-testid="sessions-loading"]').exists()).toBe(false)
    expect(names(w)).toEqual(['Verse one'])
  })

  it('says "No sessions yet" only when the list really loaded empty', async () => {
    ;(store as any).sessionsLoaded = true
    const w = await mountList()
    expect(w.text()).toContain('No sessions yet')
    expect(w.find('[data-testid="sessions-loading"]').exists()).toBe(false)
  })

  it('a failed first load says so and offers Try again, instead of an empty account', async () => {
    store.error = 'Network Error'
    const w = await mountList()
    expect(w.find('[data-testid="sessions-error"]').exists()).toBe(true)
    expect(w.text()).not.toContain('No sessions yet')
    store.fetchSessions.mockClear()
    await w.find('[data-testid="sessions-error"] button').trigger('click')
    expect(store.fetchSessions).toHaveBeenCalledTimes(1)
  })

  it('a search with no match says so, not "No sessions yet"', async () => {
    store.sessions = [session('s1', 'Verse one', '2026-11-17T10:00:00Z')]
    const w = await mountList()
    await w.find('input').setValue('zzz')
    expect(w.text()).toContain('No sessions match')
    expect(w.text()).not.toContain('No sessions yet')
  })
})
