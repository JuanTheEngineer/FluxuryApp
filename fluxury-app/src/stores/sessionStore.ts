import { defineStore } from 'pinia'
import type {
  CreateSessionRequestContent,
  SessionSummary,
  GetSessionResponseContent,
} from '@/api/open-api/session-client'
import { sessionsApi } from "@/api/api-clients";

export const useSessionStore = defineStore('sessionStore', {
  state: () => ({
    sessions: [] as SessionSummary[],
    activeSession: null as GetSessionResponseContent | null,
    isLoading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchSessions() {
      this.isLoading = true
      this.error = null
      try {
        const res = await sessionsApi.listSessions()
        this.sessions = res.data.sessions
      } catch (err) {
        this.error = 'Failed to load sessions'
        console.error(err)
      } finally {
        this.isLoading = false
      }
    },
    async loadSession(id: string) {
      this.isLoading = true
      this.error = null
      try {
        const res = await sessionsApi.getSession(id)
        this.activeSession = res.data
      } catch (err) {
        this.error = 'Failed to load session'
        console.error(err)
      } finally {
        this.isLoading = false
      }
    },
    async createSession(payload: CreateSessionRequestContent) {
      this.isLoading = true
      this.error = null
      try {
        const res = await sessionsApi.createSession(payload)
        this.activeSession = res.data
        await this.fetchSessions()
        return res.data.id
      } catch (err) {
        this.error = 'Failed to create session'
        console.error(err)
        return null
      } finally {
        this.isLoading = false
      }
    },
  },
})
