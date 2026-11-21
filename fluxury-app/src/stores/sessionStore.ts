import { defineStore } from 'pinia'
import type {
  CreateSessionRequestContent,
  SessionSummary,
  GetSessionResponseContent,
} from '@/services/api'
import { sessionsApi, storageApi } from '@/services/api'
import { decodeServerScript, encodeServerScript } from '@/services/resume'
import { ScriptConflictError, isScriptConflict } from '@/services/scriptConflict'
import { SessionDeletedError, httpStatusOf } from '@/services/sessionDeleted'
import type { QuillDelta } from '@/services/localDraft'
import { localDraftService } from '@/services/localDraft'

export const useSessionStore = defineStore('sessionStore', {
  state: () => ({
    sessions: [] as SessionSummary[],
    /**
     * True once the session list has loaded at least once since the app
     * started. Until then an empty list means "not here yet", not "no
     * sessions", so the list shows placeholders instead of an empty account.
     */
    sessionsLoaded: false,
    activeSession: null as GetSessionResponseContent | null,
    isLoading: false,
    error: null as string | null,
    successMessage: null as string | null,
    /** Script version each open session's copy is based on (see loadScript). */
    scriptVersions: {} as Record<string, string | null>,
    /**
     * Script fields this copy doesn't edit (e.g. `timing`), as loaded with its
     * version. Sent back unchanged on every save so nothing is erased.
     */
    scriptExtras: {} as Record<string, Record<string, unknown>>,
    /** Session whose saves are paused because another copy saved newer work. */
    conflictSessionId: null as string | null,
    /** Session whose saves are paused because it was deleted somewhere else. */
    deletedSessionId: null as string | null,
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
        this.sessionsLoaded = true
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

        // Forget what this browser kept for it. Best-effort: the session is
        // already gone on the server, so a failure here must not undo that.
        delete this.scriptVersions[id]
        if (this.conflictSessionId === id) this.conflictSessionId = null
        try {
          await localDraftService.delete(id)
        } catch (e) {
          console.warn(`[sessionStore] could not clear local draft for deleted session ${id}:`, e)
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

    // --- Session script (lyrics) with conflict detection ---
    //
    // Each open copy remembers the version of the script it loaded
    // (scriptVersions). Saves are conditional on that version, so a copy that
    // is behind (another tab, window or device saved since) is refused instead
    // of overwriting newer work. See services/scriptConflict.ts.

    /** Load the session's script, recording the version this copy is based on. */
    async loadScript(id: string, script: string | undefined): Promise<unknown> {
      const content = await this.fetchScript(id, script)
      this.scriptExtras[id] = decodeServerScript(content).extras ?? {}
      return content
    },

    /**
     * Change one script field the lyrics editor doesn't own (e.g. `timing`).
     * Saved with the next autosave, under the same conflict detection as the
     * lyrics. `undefined` removes the field.
     */
    setScriptExtra(id: string, key: string, value: unknown): void {
      if (key === 'delta' || key === 'editTimestamp') return
      const next = { ...(this.scriptExtras[id] ?? {}) }
      if (value === undefined) delete next[key]
      else next[key] = value
      this.scriptExtras[id] = next
    },

    async fetchScript(id: string, script: string | undefined): Promise<unknown> {
      if (this.conflictSessionId === id) this.conflictSessionId = null
      if (this.deletedSessionId === id) this.deletedSessionId = null
      if (script?.startsWith('data:application/json;base64,')) {
        // Demo mode inlines the script; there is no version to compare against.
        delete this.scriptVersions[id]
        try {
          return JSON.parse(atob(script.split(',')[1]))
        } catch {
          return null
        }
      }
      if (script?.startsWith('s3://')) {
        // A download failure throws: the caller must not fall back to an empty
        // document, which autosave would then save over the real lyrics.
        const stored = await storageApi.downloadSessionScript(id)
        this.scriptVersions[id] = stored.version
        return stored.content
      }
      this.scriptVersions[id] = null // no lyrics saved yet
      return null
    },

    // Rethrows on failure: useAutosave treats a resolved promise as "saved",
    // so swallowing the error here made failed saves look successful.
    async saveScript(id: string, delta: unknown): Promise<string> {
      // Saving is paused until the user resolves a conflict or a deletion; this
      // throws without a network call, so autosave retries can't write anything.
      if (this.conflictSessionId === id) throw new ScriptConflictError(id)
      if (this.deletedSessionId === id) throw new SessionDeletedError(id)
      try {
        const expected = id in this.scriptVersions ? this.scriptVersions[id] : undefined
        const { url: scriptUrl, version } = await storageApi.uploadSessionScript(
          id,
          encodeServerScript(delta as QuillDelta, Date.now(), this.scriptExtras[id]),
          expected,
        )
        this.scriptVersions[id] = version
        await sessionsApi.updateSession(id, {
          name: this.activeSession?.name ?? '',
          artworkUrl: this.activeSession?.artworkUrl ?? '',
          script: scriptUrl,
        })
        return scriptUrl
      } catch (err: any) {
        if (isScriptConflict(err)) {
          this.conflictSessionId = id
          throw err
        }
        if (await this.wasDeletedElsewhere(id, err)) {
          this.deletedSessionId = id
          throw new SessionDeletedError(id)
        }
        const errorMessage = err.response?.data?.message || err.message || 'Failed to save script'
        this.setError(errorMessage)
        throw err
      }
    },

    /**
     * After a failed save, did the failure happen because the session is gone?
     * S3 answers 404 (If-Match on a deleted file); or the upload succeeds
     * (If-None-Match ignores delete markers) and the API answers 403 because
     * the record is missing. Only those statuses are worth one extra request,
     * and only a definite 404 from the API counts as deleted.
     */
    async wasDeletedElsewhere(id: string, err: unknown): Promise<boolean> {
      const status = httpStatusOf(err)
      if (status !== 403 && status !== 404) return false
      try {
        await sessionsApi.getSession(id)
        return false
      } catch (probeErr) {
        return httpStatusOf(probeErr) === 404
      }
    },

    /** Create a new session holding these lyrics (and any extra script fields); returns its id. */
    async createSessionWithLyrics(
      name: string,
      beatId: string | undefined,
      delta: QuillDelta,
      extras: Record<string, unknown> = {},
    ): Promise<string> {
      // CreateSessionRequestContent lacks beatId (BACKLOG Batch D, one API contract)
      const created = await sessionsApi.createSession(
        { name, ...(beatId ? { beatId } : {}) } as CreateSessionRequestContent,
      )
      const newId = created.data.id
      const { url, version } = await storageApi.uploadSessionScript(newId, encodeServerScript(delta, Date.now(), extras), null)
      this.scriptVersions[newId] = version
      this.scriptExtras[newId] = extras
      await sessionsApi.updateSession(newId, { name, artworkUrl: '', script: url })
      return newId
    },

    /**
     * Deleted elsewhere: keep this copy's lyrics as a new "(restored)" session,
     * with the same beat. Returns the new session so the editor can open it.
     */
    async saveDeletedAsNewSession(id: string, mine: QuillDelta): Promise<{ id: string; name: string }> {
      const original = this.activeSession?.id === id ? this.activeSession : null
      const name = `${original?.name || 'Untitled Session'} (restored)`
      const beatId = (original as { beatId?: string } | null)?.beatId
      const newId = await this.createSessionWithLyrics(name, beatId, mine, this.scriptExtras[id])

      this.deletedSessionId = null
      delete this.scriptVersions[id]
      try {
        await localDraftService.delete(id) // its lyrics now live in the new session
      } catch (e) {
        console.warn(`[sessionStore] could not clear local draft for deleted session ${id}:`, e)
      }
      return { id: newId, name }
    },

    /**
     * Conflict: overwrite the newer version with this copy. "This copy" means
     * all of it: lyrics, line times and any extra fields it loaded.
     */
    async resolveConflictKeepMine(id: string): Promise<void> {
      // Rebase onto the latest version so the next save is accepted. The
      // version being replaced stays recoverable in S3 version history.
      const latest = await storageApi.downloadSessionScript(id)
      this.scriptVersions[id] = latest.version
      this.conflictSessionId = null
    },

    /**
     * Conflict: switch to the newer version, first saving this copy's lyrics
     * as a new session so nothing is lost. Returns the latest script and the
     * name of the copy.
     */
    async resolveConflictUseLatest(id: string, mine: QuillDelta): Promise<{ latest: unknown; copyName: string }> {
      const original = this.activeSession?.id === id ? this.activeSession : null
      const copyName = `${original?.name || 'Untitled Session'} (my version)`
      const beatId = (original as { beatId?: string } | null)?.beatId
      await this.createSessionWithLyrics(copyName, beatId, mine, this.scriptExtras[id])

      const latest = await storageApi.downloadSessionScript(id)
      this.scriptVersions[id] = latest.version
      this.scriptExtras[id] = decodeServerScript(latest.content).extras ?? {}
      this.conflictSessionId = null
      return { latest: latest.content, copyName }
    },
  },
})
