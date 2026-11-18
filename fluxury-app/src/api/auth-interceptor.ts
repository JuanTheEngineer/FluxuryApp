import axios from 'axios'
import { fetchAuthSession } from 'aws-amplify/auth'
import { loginHref } from '@/router/authGuard'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

/**
 * Creates an axios instance with automatic JWT token injection
 * and 401 token refresh + redirect behavior.
 */
export function createAuthenticatedClient() {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000, // 30s for Lambda cold starts
  })

  // Request interceptor: attach JWT token
  client.interceptors.request.use(async (config) => {
    try {
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch (error) {
      console.warn('[auth-interceptor] Failed to get session token:', error)
    }
    return config
  })

  // Response interceptor: handle 401 with retry
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config

      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true

        try {
          // Force refresh the token
          const session = await fetchAuthSession({ forceRefresh: true })
          const newToken = session.tokens?.idToken?.toString()

          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            return client(originalRequest)
          }
        } catch (refreshError) {
          console.warn('[auth-interceptor] Token refresh failed, redirecting to login')
          // Full reload to the login page, coming back here after sign-in and
          // saying why (the router guard can't run for an API call).
          const here = window.location.pathname + window.location.search
          window.location.href = loginHref(here, true)
          return Promise.reject(refreshError)
        }
      }

      return Promise.reject(error)
    }
  )

  return client
}

// Export utility functions for the real API client
export async function isAuthenticated(): Promise<boolean> {
  try {
    const session = await fetchAuthSession()
    return !!session.tokens?.idToken
  } catch {
    return false
  }
}

export async function getCurrentUser(): Promise<{ username: string; email?: string; sub: string }> {
  const session = await fetchAuthSession()
  const idToken = session.tokens?.idToken
  if (!idToken) throw new Error('Not authenticated')

  const payload = idToken.payload
  return {
    username: (payload['cognito:username'] as string) || (payload.email as string) || 'unknown',
    email: payload.email as string | undefined,
    sub: payload.sub as string,
  }
}

// Default authenticated client instance
export const authClient = createAuthenticatedClient()
