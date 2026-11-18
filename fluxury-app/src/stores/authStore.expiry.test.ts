import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Telling "your login expired" apart from "you never signed in". Amplify
 * clears its own storage when a refresh fails, so the app keeps one small
 * marker of its own: set on sign-in, cleared on sign-out.
 */
const authApi = {
  isAuthenticated: vi.fn<() => Promise<boolean>>(),
  getCurrentUser: vi.fn().mockResolvedValue({ username: 'beta' }),
  login: vi.fn().mockResolvedValue({ success: true }),
  logout: vi.fn().mockResolvedValue({ success: true }),
}
vi.mock('@/services/api', () => ({ authApi }))

async function freshStore() {
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useAuthStore } = await import('./authStore')
  return useAuthStore()
}

describe('authStore: noticing an expired login', () => {
  beforeEach(() => {
    localStorage.clear()
    authApi.isAuthenticated.mockReset()
  })

  it('a first-time visitor is just signed out, not "expired"', async () => {
    authApi.isAuthenticated.mockResolvedValue(false)
    const auth = await freshStore()
    await auth.checkAuthStatus()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.sessionExpired).toBe(false)
  })

  it('someone who was signed in on this device and no longer is: expired', async () => {
    authApi.isAuthenticated.mockResolvedValue(true)
    let auth = await freshStore()
    await auth.login('beta', 'pw')

    authApi.isAuthenticated.mockResolvedValue(false) // e.g. 14 days later, refresh token rejected
    auth = await freshStore() // a new page load
    await auth.checkAuthStatus()
    expect(auth.sessionExpired).toBe(true)
  })

  it('signing out on purpose is not "expired"', async () => {
    authApi.isAuthenticated.mockResolvedValue(true)
    let auth = await freshStore()
    await auth.login('beta', 'pw')
    await auth.logout()

    authApi.isAuthenticated.mockResolvedValue(false)
    auth = await freshStore()
    await auth.checkAuthStatus()
    expect(auth.sessionExpired).toBe(false)
  })

  it('people already signed in before this shipped get the marker on their next visit', async () => {
    authApi.isAuthenticated.mockResolvedValue(true)
    let auth = await freshStore()
    await auth.checkAuthStatus() // no login() call: an existing Amplify session

    authApi.isAuthenticated.mockResolvedValue(false)
    auth = await freshStore()
    await auth.checkAuthStatus()
    expect(auth.sessionExpired).toBe(true)
  })

  it('signing in again clears "expired"', async () => {
    authApi.isAuthenticated.mockResolvedValue(true)
    let auth = await freshStore()
    await auth.login('beta', 'pw')
    authApi.isAuthenticated.mockResolvedValue(false)
    auth = await freshStore()
    await auth.checkAuthStatus()
    expect(auth.sessionExpired).toBe(true)

    authApi.isAuthenticated.mockResolvedValue(true)
    await auth.login('beta', 'pw')
    expect(auth.sessionExpired).toBe(false)
  })
})
