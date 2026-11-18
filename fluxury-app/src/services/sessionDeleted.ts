/**
 * Thrown when saving fails because the session was deleted in another tab,
 * window or device. The lyrics in the editor (and the local draft) are intact;
 * the writer can save them as a new session.
 */
export class SessionDeletedError extends Error {
  readonly sessionId: string

  constructor(sessionId: string) {
    super(`Session ${sessionId} was deleted somewhere else`)
    this.name = 'SessionDeletedError'
    this.sessionId = sessionId
  }
}

/** By name, not instanceof (survives module copies), like isScriptConflict. */
export function isSessionDeleted(err: unknown): err is SessionDeletedError {
  return (err as { name?: string } | null)?.name === 'SessionDeletedError'
}

/** HTTP status from an axios error or an AWS SDK error, if any. */
export function httpStatusOf(err: unknown): number | undefined {
  const e = err as { response?: { status?: number }; $metadata?: { httpStatusCode?: number } } | null
  return e?.response?.status ?? e?.$metadata?.httpStatusCode
}
