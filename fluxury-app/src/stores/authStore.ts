import { defineStore } from 'pinia'
import { authApi } from '@/services/api'
import type { AuthUser } from '@/services/api'
import { signInMarker } from '@/services/signInMarker'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as AuthUser | null,
    isAuthenticated: false,
    isLoading: false,
    authChecked: false,
    error: null as string | null,
    /** Was signed in on this device, and that login has since expired. */
    sessionExpired: false,
  }),

  actions: {
    async checkAuthStatus() {
      this.isLoading = true
      try {
        const authenticated = await authApi.isAuthenticated()
        if (authenticated) {
          const userInfo = await authApi.getCurrentUser()
          this.user = userInfo
          this.isAuthenticated = true
          this.sessionExpired = false
          signInMarker.set()
        } else {
          this.user = null
          this.isAuthenticated = false
          this.noteIfExpired()
        }
      } catch (error) {
        console.warn('Auth status check failed:', error)
        this.user = null
        this.isAuthenticated = false
        this.noteIfExpired()
      } finally {
        this.isLoading = false
        this.authChecked = true
      }
    },

    /** Signed out without signing out: the saved login expired or was revoked. */
    noteIfExpired() {
      if (signInMarker.isSet()) {
        this.sessionExpired = true
        signInMarker.clear() // say it once; the login page carries the message via ?reason=expired
      }
    },

    async login(username: string, password: string) {
      this.isLoading = true
      this.error = null
      try {
        const result = await authApi.login(username, password)
        if (result.success) {
          await this.checkAuthStatus()
          return { success: true }
        }
        return { success: false, error: 'Login failed' }
      } catch (error: any) {
        this.error = error.message || 'Login failed'
        console.error('Login error:', error)
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async register(username: string, email: string, password: string) {
      this.isLoading = true
      this.error = null
      try {
        // Registration delegates to authApi.login in demo mode.
        // Real Cognito signUp flow is punted to a post-stabilization spec
        // that will add a `register` method to the AuthApiContract.
        const result = await authApi.login(username, password)
        if (result.success) {
          await this.checkAuthStatus()
          return { success: true }
        }
        return { success: false, error: 'Registration failed' }
      } catch (error: any) {
        this.error = error.message || 'Registration failed'
        console.error('Registration error:', error)
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async confirmRegistration(_username: string, _confirmationCode: string) {
      this.isLoading = true
      this.error = null
      try {
        // Real Cognito confirmSignUp is punted to a post-stabilization spec
        // that will add a `confirmRegistration` method to the AuthApiContract.
        return { success: true }
      } catch (error: any) {
        this.error = error.message || 'Confirmation failed'
        console.error('Confirmation error:', error)
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async logout() {
      this.isLoading = true
      try {
        await authApi.logout()
        signInMarker.clear() // signing out on purpose isn't "expired"
        this.user = null
        this.isAuthenticated = false
        this.authChecked = false
        this.error = null
      } catch (error: any) {
        console.error('Logout error:', error)
        this.error = error.message || 'Logout failed'
      } finally {
        this.isLoading = false
      }
    },

    clearError() {
      this.error = null
    }
  },
})
