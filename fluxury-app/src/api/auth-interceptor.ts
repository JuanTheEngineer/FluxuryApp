import { fetchAuthSession } from 'aws-amplify/auth'
import type { AxiosRequestConfig } from 'axios'

/**
 * Authentication interceptor that adds JWT tokens to API requests
 */
export const createAuthInterceptor = () => {
  return async (config: AxiosRequestConfig): Promise<AxiosRequestConfig> => {
    try {
      // Get the current auth session from AWS Amplify
      const session = await fetchAuthSession()

      if (session.tokens?.idToken) {
        // Add the Authorization header with the JWT token
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${session.tokens.idToken.toString()}`
        }
      }
    } catch (error) {
      console.warn('Failed to get auth session:', error)
      // Continue with request even if auth fails (for public endpoints)
    }

    return config
  }
}

/**
 * Check if user is authenticated
 */
export const isAuthenticated = async (): Promise<boolean> => {
  try {
    const session = await fetchAuthSession()
    return !!session.tokens?.idToken
  } catch {
    return false
  }
}

/**
 * Get current user info from JWT token
 */
export const getCurrentUser = async () => {
  try {
    const session = await fetchAuthSession()
    if (session.tokens?.idToken) {
      return session.tokens.idToken.payload
    }
    return null
  } catch (error) {
    console.error('Failed to get current user:', error)
    return null
  }
}