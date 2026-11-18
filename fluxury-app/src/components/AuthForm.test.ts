import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

describe('AuthForm in real mode: accounts are created by an admin (beta)', () => {
  async function mountReal() {
    vi.stubEnv('VITE_DEMO_MODE', 'false') // vitest pins demo mode; this form reads it at load
    vi.resetModules()
    const { default: RealAuthForm } = await import('./AuthForm.vue')
    return mount(RealAuthForm)
  }

  beforeEach(() => { route.query = {} })
  afterEach(() => { vi.unstubAllEnvs() })

  it('offers no way to sign up (it would only fail)', async () => {
    const w = await mountReal()
    expect(w.text()).not.toMatch(/sign up/i)
    expect(w.text()).not.toMatch(/create (your fluxury )?account/i)
  })

  it('says how to get an account', async () => {
    const w = await mountReal()
    expect(w.find('[data-testid="invite-only"]').text()).toBe(
      'Fluxury is invite-only during the beta. Ask the person who invited you for an account.',
    )
  })
})
