import { defineStore } from 'pinia'
import type {
  CreateSessionRequestContent,
  SessionSummary,
  GetSessionResponseContent,
} from '@/services/api'
import { sessionsApi, storageApi } from '@/services/api'

export const useSessionStore = defineStore('sessionStore', {
  state: () => ({
    sessions: [] as SessionSummary[],
    activeSession: null as GetSessionResponseContent | null,
    isLoading: false,
    error: null as string | null,
    successMessage: null as string | null,
  }),

  getters: {
    getSessionById: (state) => (id: string) => {
      return state.sessions.find(session => session.id === id)
    },
    hasError: (state) => !!state.error,
    hasSuccessMessage: (state) => !!state.successMessage,
  },

  actions: {
    clearMessages() {
      this.error = null
      this.successMessage = null
    },

    setError(message: string) {
      this.error = message
      console.error('Session Store Error:', message)
    },

    setSuccess(message: string) {
      this.successMessage = message
      // Auto-clear success message after 3 seconds
      setTimeout(() => {
        this.successMessage = null
      }, 3000)
    },

    async fetchSessions() {
      this.isLoading = true
      this.clearMessages()

      try {
        const res = await sessionsApi.listSessions()
        this.sessions = res.data.sessions
        this.setSuccess(`Loaded ${res.data.sessions.length} sessions`)
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to load sessions'
        this.setError(errorMessage)

        // If it's an auth error, could emit event for redirect
        if (err.response?.status === 401) {
          console.warn('Authentication expired during session fetch')
        }
      } finally {
        this.isLoading = false
      }
    },

    async loadSession(id: string) {
      this.isLoading = true
      this.clearMessages()
      // Drop the previous session first: if this load fails, the view must not
      // keep rendering (or autosaving into) the session that was open before.
      this.activeSession = null

      try {
        const res = await sessionsApi.getSession(id)
        this.activeSession = res.data
        this.setSuccess('Session loaded successfully')
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to load session'
        this.setError(errorMessage)

        if (err.response?.status === 404) {
          this.setError('Session not found')
        } else if (err.response?.status === 403) {
          this.setError('Access denied to this session')
        }
      } finally {
        this.isLoading = false
      }
    },

    async createSession(payload: CreateSessionRequestContent) {
      this.isLoading = true
      this.clearMessages()

      try {
        const res = await sessionsApi.createSession(payload)
        this.activeSession = res.data
        this.setSuccess('Session created successfully')

        // Refresh sessions list in background
        this.fetchSessions()

        return res.data.id
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to create session'
        this.setError(errorMessage)

        if (err.response?.status === 400) {
          this.setError('Invalid session data provided')
        } else if (err.response?.status === 409) {
          this.setError('A session with this name already exists')
        }

        return null
      } finally {
        this.isLoading = false
      }
    },

    async updateSession(id: string, payload: any) {
      this.isLoading = true
      this.clearMessages()

      try {
        const res = await sessionsApi.updateSession(id, payload)
        this.activeSession = res.data
        this.setSuccess('Session updated successfully')

        // Update in sessions list if present
        const index = this.sessions.findIndex(s => s.id === id)
        if (index !== -1) {
          this.sessions[index] = { ...this.sessions[index], ...payload }
        }

        return res.data
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to update session'
        this.setError(errorMessage)
        return null
      } finally {
        this.isLoading = false
      }
    },

    async deleteSession(id: string) {
      this.isLoading = true
      this.clearMessages()

      try {
        await sessionsApi.deleteSession(id)

        // Remove from sessions list
        this.sessions = this.sessions.filter(s => s.id !== id)

        // Clear active session if it was deleted
        if (this.activeSession?.id === id) {
          this.activeSession = null
        }

        this.setSuccess('Session deleted successfully')
        return true
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to delete session'
        this.setError(errorMessage)
        return false
      } finally {
        this.isLoading = false
      }
    },

    async updateSessionName(id: string, name: string) {
      try {
        await sessionsApi.updateSession(id, { name })
        const index = this.sessions.findIndex(s => s.id === id)
        if (index !== -1) {
          this.sessions[index] = { ...this.sessions[index], name }
        }
      } catch (err: any) {
        console.error('Failed to update session name:', err)
      }
    },

    // Rethrows on failure: useAutosave treats a resolved promise as "saved",
    // so swallowing the error here made failed saves look successful.
    async saveScript(id: string, delta: unknown): Promise<string> {
      try {
        const scriptUrl = await storageApi.uploadSessionScript(id, delta)
        await sessionsApi.updateSession(id, {
          name: this.activeSession?.name ?? '',
          artworkUrl: this.activeSession?.artworkUrl ?? '',
          script: scriptUrl,
        })
        return scriptUrl
      } catch (err: any) {
        const errorMessage = err.response?.data?.message || err.message || 'Failed to save script'
        this.setError(errorMessage)
        throw err
      }
    },
  },
})
