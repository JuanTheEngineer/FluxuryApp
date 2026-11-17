import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

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

const session = (id: string, name: string, modified: string) => ({ id, name, author: '', created: modified, modified })

async function mountList() {
  const w = mount(SessionBrowserView, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  return w
}
const names = (w: any) => w.findAll('[data-testid="session-card"] h3').map((h: any) => h.text())

describe('SessionBrowserView: delete with undo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    push.mockReset()
    store.sessions = [session('s1', 'Verse one', '2026-11-17T10:00:00Z'), session('s2', 'Hook', '2026-11-16T10:00:00Z')]
    store.deleteSession.mockReset().mockImplementation(async (id: string) => {
      store.sessions = store.sessions.filter((s) => s.id !== id)
      return true
    })
  })
  afterEach(() => vi.useRealTimers())

  it('hides the session at once, offers Undo, and does not open the session', async () => {
    const w = await mountList()
    await w.findAll('[data-testid="delete-session"]')[0].trigger('click')

    expect(names(w)).toEqual(['Hook'])
    expect(w.find('[data-testid="delete-status"]').text()).toContain('Deleted “Verse one”')
    expect(store.deleteSession).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('Undo brings it back and nothing is deleted', async () => {
    const w = await mountList()
    await w.findAll('[data-testid="delete-session"]')[0].trigger('click')
    await w.find('[data-testid="undo-delete"]').trigger('click')
    await vi.advanceTimersByTimeAsync(10_000)

    expect(names(w)).toEqual(['Verse one', 'Hook'])
    expect(store.deleteSession).not.toHaveBeenCalled()
    expect(w.find('[data-testid="delete-status"]').exists()).toBe(false)
  })

  it('deletes after 5 seconds', async () => {
    const w = await mountList()
    await w.findAll('[data-testid="delete-session"]')[0].trigger('click')
    await vi.advanceTimersByTimeAsync(5000)

    expect(store.deleteSession).toHaveBeenCalledWith('s1')
    expect(names(w)).toEqual(['Hook'])
    expect(w.find('[data-testid="delete-status"]').exists()).toBe(false)
  })

  it('the resume card skips a session pending deletion', async () => {
    const w = await mountList()
    expect(w.text()).toContain('Continue where you left off')
    await w.findAll('[data-testid="delete-session"]')[0].trigger('click')

    const resume = w.find('.bg-surface-elevated.border.rounded-xl.p-4')
    expect(resume.text()).toContain('Hook')
    expect(resume.text()).not.toContain('Verse one')
  })

  it('a failed delete brings the session back and says so', async () => {
    store.deleteSession.mockResolvedValue(false)
    const w = await mountList()
    await w.findAll('[data-testid="delete-session"]')[0].trigger('click')
    await vi.advanceTimersByTimeAsync(5000)

    expect(names(w)).toEqual(['Verse one', 'Hook'])
    expect(w.find('[data-testid="delete-status"]').text()).toContain("Couldn't delete “Verse one”")
  })

  it('leaving the list commits the pending delete immediately', async () => {
    const w = await mountList()
    await w.findAll('[data-testid="delete-session"]')[0].trigger('click')
    w.unmount()
    await flushPromises()

    expect(store.deleteSession).toHaveBeenCalledWith('s1')
  })

  it('the delete button has an accessible name per session', async () => {
    const w = await mountList()
    const labels = w.findAll('[data-testid="delete-session"]').map((b) => b.attributes('aria-label'))
    expect(labels).toEqual(['Delete Verse one', 'Delete Hook'])
  })
})
