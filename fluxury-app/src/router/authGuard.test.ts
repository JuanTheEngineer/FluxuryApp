import { describe, it, expect } from 'vitest'
import { afterSignIn, authRedirect, loginHref, loginQuery, safeRedirect } from './authGuard'

describe('safeRedirect', () => {
  it.each(['/session/abc', '/beats?new=1', '/sessions#top'])('accepts in-app path %s', (p) => {
    expect(safeRedirect(p)).toBe(p)
  })

  it.each([
    ['protocol-relative URL', '//evil.com/x'],
    ['backslash trick', '/\\evil.com'],
    ['absolute URL', 'https://evil.com/'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'session/abc'],
    ['the login page (loop)', '/login'],
    ['the login page with a query', '/login?redirect=/x'],
    ['not a string', ['/session/abc']],
    ['empty', ''],
    ['missing', undefined],
  ])('rejects %s', (_label, value) => {
    expect(safeRedirect(value)).toBeNull()
  })
})

describe('loginQuery / loginHref', () => {
  it('remembers where you were and why you were sent to sign in', () => {
    expect(loginQuery('/session/abc', true)).toEqual({ redirect: '/session/abc', reason: 'expired' })
    expect(loginHref('/session/abc', true)).toBe('/login?redirect=%2Fsession%2Fabc&reason=expired')
  })

  it('keeps the URL clean when there is nothing to say', () => {
    expect(loginQuery('/sessions', false)).toEqual({})
    expect(loginHref('/sessions', false)).toBe('/login')
  })

  it('drops an unsafe "from"', () => {
    expect(loginQuery('//evil.com', false)).toEqual({})
  })
})

describe('afterSignIn', () => {
  it('returns to the remembered page, or the session list', () => {
    expect(afterSignIn({ redirect: '/session/abc' })).toBe('/session/abc')
    expect(afterSignIn({})).toBe('/sessions')
    expect(afterSignIn({ redirect: 'https://evil.com' })).toBe('/sessions')
  })
})

describe('authRedirect (router guard)', () => {
  const page = (fullPath: string, meta = {}, query = {}) => ({ fullPath, meta, query })
  const signedOut = { isAuthenticated: false, sessionExpired: false }
  const expired = { isAuthenticated: false, sessionExpired: true }
  const signedIn = { isAuthenticated: true, sessionExpired: false }

  it('sends a signed-out visitor to sign in, remembering the page', () => {
    expect(authRedirect(page('/session/abc', { requiresAuth: true }), signedOut))
      .toEqual({ path: '/login', query: { redirect: '/session/abc' } })
  })

  it('says the login expired when it did', () => {
    expect(authRedirect(page('/session/abc', { requiresAuth: true }), expired))
      .toEqual({ path: '/login', query: { redirect: '/session/abc', reason: 'expired' } })
  })

  it('lets signed-in people through, and public pages for everyone', () => {
    expect(authRedirect(page('/session/abc', { requiresAuth: true }), signedIn)).toBeNull()
    expect(authRedirect(page('/login', { requiresGuest: true }), signedOut)).toBeNull()
  })

  it('a signed-in visitor on /login goes to the remembered page', () => {
    expect(authRedirect(page('/login', { requiresGuest: true }, { redirect: '/beats?new=1' }), signedIn)).toBe('/beats?new=1')
    expect(authRedirect(page('/login', { requiresGuest: true }), signedIn)).toBe('/sessions')
  })
})
