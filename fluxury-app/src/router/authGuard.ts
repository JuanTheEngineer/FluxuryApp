/**
 * Where to send someone who isn't (or is) signed in. Pure functions, so the
 * router guard, the login form and the 401 handler share one set of rules.
 */
export const LOGIN_PATH = '/login'
export const DEFAULT_AFTER_SIGN_IN = '/sessions'

/**
 * A redirect target from the URL, or null if it isn't a safe in-app path.
 * Only same-origin paths ("/session/abc"), never "//evil.com", full URLs, or
 * the login page itself (which would loop).
 */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return null
  }
  const path = value.split(/[?#]/)[0]
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`)) return null
  return value
}

// A type alias, not an interface: vue-router's query type is an index-signature
// record, which interfaces aren't assignable to.
export type LoginQuery = {
  redirect?: string
  reason?: 'expired'
}

/** Query for the login page: come back to `from`, and say why if the login expired. */
export function loginQuery(from: string, expired: boolean): LoginQuery {
  const redirect = safeRedirect(from)
  return {
    ...(redirect && redirect !== DEFAULT_AFTER_SIGN_IN ? { redirect } : {}),
    ...(expired ? { reason: 'expired' as const } : {}),
  }
}

/** Same as loginQuery, as a URL for a full-page redirect (outside the router). */
export function loginHref(from: string, expired: boolean): string {
  const query = new URLSearchParams(loginQuery(from, expired) as Record<string, string>).toString()
  return query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH
}

/** Where to go after a successful sign-in. */
export function afterSignIn(query: Record<string, unknown>): string {
  return safeRedirect(query.redirect) ?? DEFAULT_AFTER_SIGN_IN
}

interface GuardTarget {
  fullPath: string
  meta: { requiresAuth?: boolean; requiresGuest?: boolean }
  query: Record<string, unknown>
}
interface GuardAuth {
  isAuthenticated: boolean
  sessionExpired: boolean
}

/**
 * The router guard's decision: where to redirect, or null to continue. A
 * string is a full in-app path (it may carry its own query); vue-router
 * parses strings, but not a query embedded in `{ path }`.
 */
export function authRedirect(to: GuardTarget, auth: GuardAuth): string | { path: string; query: LoginQuery } | null {
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: LOGIN_PATH, query: loginQuery(to.fullPath, auth.sessionExpired) }
  }
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    return afterSignIn(to.query)
  }
  return null
}
