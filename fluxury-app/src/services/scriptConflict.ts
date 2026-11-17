/**
 * Thrown when a script save is refused because another tab, window or device
 * saved a newer version since this copy loaded it. Nothing was overwritten.
 */
export class ScriptConflictError extends Error {
  readonly sessionId: string

  constructor(sessionId: string) {
    super(`Session ${sessionId} was changed somewhere else since it was opened`)
    this.name = 'ScriptConflictError'
    this.sessionId = sessionId
  }
}

/**
 * Version a save expects the stored script to be at:
 * - string    → must still be this version (S3 ETag)
 * - null      → must not exist yet (first save of a new session)
 * - undefined → unknown, write unconditionally (legacy/demo callers)
 */
export type ExpectedVersion = string | null | undefined
