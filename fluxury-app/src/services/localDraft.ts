/**
 * Local Draft Service
 *
 * Provides local persistence for session drafts using IndexedDB as primary storage
 * with localStorage as a fallback. Ensures zero-data-loss by writing drafts locally
 * within 500ms of any edit event.
 *
 * Requirements: 6.1, 6.6, 9.1
 */

// --- Types ---

export interface QuillDelta {
  ops: Array<{
    insert?: string | object
    delete?: number
    retain?: number
    attributes?: Record<string, unknown>
  }>
}

export interface LocalDraft {
  sessionId: string
  delta: QuillDelta
  editTimestamp: number        // epoch ms — used for Last_Write_Wins comparison
  cursorPosition: number       // character offset
  beatPlaybackPosition: number // seconds into the beat
  beatVolume: number           // 0–1
  beatLooping: boolean
}

export interface LocalDraftService {
  get(sessionId: string): Promise<LocalDraft | null>
  set(draft: LocalDraft): Promise<void>
  delete(sessionId: string): Promise<void>
  isAvailable(): boolean
}

// --- Constants ---

const DB_NAME = 'fluxury-app'
const STORE_NAME = 'fluxury-drafts'
const DB_VERSION = 1
const LS_KEY_PREFIX = 'fluxury-draft-'

// --- Implementation ---

class LocalDraftServiceImpl implements LocalDraftService {
  private _idbAvailable: boolean | null = null
  private _db: IDBDatabase | null = null
  private _initPromise: Promise<void> | null = null

  /**
   * Returns whether IndexedDB is available.
   * Returns the cached detection result, or false if detection hasn't run yet.
   */
  isAvailable(): boolean {
    return this._idbAvailable === true
  }

  /**
   * Lazily initializes the storage backend on first use.
   * Attempts to open IndexedDB; falls back to localStorage on failure.
   */
  private async _ensureInit(): Promise<void> {
    if (this._idbAvailable !== null) return
    if (this._initPromise) return this._initPromise

    this._initPromise = this._detectStorage()
    return this._initPromise
  }

  private async _detectStorage(): Promise<void> {
    try {
      this._db = await this._openDatabase()
      this._idbAvailable = true
    } catch {
      console.warn('[localDraft] degraded-storage: IndexedDB unavailable, falling back to localStorage')
      this._idbAvailable = false
      this._db = null
    }
  }

  private _openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available'))
        return
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'sessionId' })
        }
      }

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result)
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  /**
   * Retrieves a draft for the given sessionId.
   */
  async get(sessionId: string): Promise<LocalDraft | null> {
    await this._ensureInit()

    if (this._idbAvailable && this._db) {
      return this._idbGet(sessionId)
    }
    return this._lsGet(sessionId)
  }

  /**
   * Persists a draft. Handles localStorage quota exceeded by evicting the
   * oldest draft for a different session.
   */
  async set(draft: LocalDraft): Promise<void> {
    await this._ensureInit()

    if (this._idbAvailable && this._db) {
      return this._idbSet(draft)
    }
    return this._lsSet(draft)
  }

  /**
   * Deletes a draft for the given sessionId.
   */
  async delete(sessionId: string): Promise<void> {
    await this._ensureInit()

    if (this._idbAvailable && this._db) {
      return this._idbDelete(sessionId)
    }
    this._lsDelete(sessionId)
  }

  // --- IndexedDB operations ---

  private _idbGet(sessionId: string): Promise<LocalDraft | null> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(sessionId)

      request.onsuccess = () => {
        resolve(request.result ?? null)
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  private _idbSet(draft: LocalDraft): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(draft)

      request.onsuccess = () => {
        resolve()
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  private _idbDelete(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this._db!.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(sessionId)

      request.onsuccess = () => {
        resolve()
      }
      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  // --- localStorage operations ---

  private _lsGet(sessionId: string): LocalDraft | null {
    try {
      const raw = localStorage.getItem(`${LS_KEY_PREFIX}${sessionId}`)
      if (!raw) return null
      return JSON.parse(raw) as LocalDraft
    } catch {
      return null
    }
  }

  private _lsSet(draft: LocalDraft): void {
    const key = `${LS_KEY_PREFIX}${draft.sessionId}`
    const value = JSON.stringify(draft)

    try {
      localStorage.setItem(key, value)
    } catch (e: unknown) {
      // Handle QuotaExceededError by evicting oldest draft from a different session
      if (this._isQuotaError(e)) {
        this._evictOldestDraft(draft.sessionId)
        // Retry once after eviction
        try {
          localStorage.setItem(key, value)
        } catch {
          // If still failing after eviction, there's nothing more we can do
          console.warn('[localDraft] localStorage quota exceeded even after eviction')
        }
      } else {
        throw e
      }
    }
  }

  private _lsDelete(sessionId: string): void {
    localStorage.removeItem(`${LS_KEY_PREFIX}${sessionId}`)
  }

  /**
   * Finds all fluxury-draft-* keys, parses each, finds the one with the oldest
   * editTimestamp that isn't the current session, and deletes it.
   */
  private _evictOldestDraft(currentSessionId: string): void {
    let oldestKey: string | null = null
    let oldestTimestamp = Infinity

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(LS_KEY_PREFIX)) continue

      const sessionId = key.slice(LS_KEY_PREFIX.length)
      if (sessionId === currentSessionId) continue

      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const draft = JSON.parse(raw) as LocalDraft
        if (draft.editTimestamp < oldestTimestamp) {
          oldestTimestamp = draft.editTimestamp
          oldestKey = key
        }
      } catch {
        // If we can't parse it, it's a candidate for eviction
        oldestKey = key
        oldestTimestamp = 0
      }
    }

    if (oldestKey) {
      localStorage.removeItem(oldestKey)
    }
  }

  private _isQuotaError(e: unknown): boolean {
    if (e instanceof DOMException) {
      // Most browsers
      return e.code === 22 || e.name === 'QuotaExceededError'
    }
    return false
  }
}

// Export singleton instance
export const localDraftService: LocalDraftService = new LocalDraftServiceImpl()
