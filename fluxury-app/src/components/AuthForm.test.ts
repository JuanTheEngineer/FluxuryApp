import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

const route = reactive({ query: {} as Record<string, string> })
const replace = vi.fn()
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ replace, push: vi.fn() }) }))

const auth = reactive({
  error: null as string | null,
  isAuthenticated: false,
  clearError: vi.fn(),
  login: vi.fn().mockResolvedValue({ success: true }),
  register: vi.fn(),
})
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => auth }))

import AuthForm from './AuthForm.vue'

async function signIn(w: ReturnType<typeof mount>) {
  await w.find('input[autocomplete="username"]').setValue('beta')
  await w.find('input[type="password"]').setValue('pw')
  await w.find('form').trigger('submit')
  await flushPromises()
}

describe('AuthForm', () => {
  beforeEach(() => {
    route.query = {}
    replace.mockReset()
    auth.login.mockClear()
  })

  it('explains why you are here when your login expired', () => {
    route.query = { reason: 'expired', redirect: '/session/abc' }
    const w = mount(AuthForm)
    expect(w.find('[data-testid="login-expired"]').text()).toBe('Your session expired. Sign in again to keep writing.')
  })

  it('shows no message on a normal visit', () => {
    const w = mount(AuthForm)
    expect(w.find('[data-testid="login-expired"]').exists()).toBe(false)
  })

  it('after signing in, returns you to the page you were on', async () => {
    route.query = { reason: 'expired', redirect: '/session/abc' }
    const w = mount(AuthForm)
    await signIn(w)
    expect(auth.login).toHaveBeenCalledWith('beta', 'pw')
    expect(replace).toHaveBeenCalledWith('/session/abc')
  })

  it('without a remembered page, goes to the session list', async () => {
    const w = mount(AuthForm)
    await signIn(w)
    expect(replace).toHaveBeenCalledWith('/sessions')
  })

  it('never follows a redirect off the site', async () => {
    route.query = { redirect: '//evil.com/phish' }
    const w = mount(AuthForm)
    await signIn(w)
    expect(replace).toHaveBeenCalledWith('/sessions')
  })
})
