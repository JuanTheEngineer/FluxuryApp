import fc from 'fast-check'

// Types matching the design doc
export interface QuillDelta {
  ops: Array<{
    insert?: string | object
    delete?: number
    retain?: number
    attributes?: Record<string, unknown>
  }>
}

export type SaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'offline_saved_locally'
  | 'error'

export type SessionLifecycleState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'editing'
  | 'saving'
  | 'saved'
  | 'error'

export type SaveEvent =
  | 'edit'
  | 'debounce_expire'
  | 'periodic_flush'
  | 'manual_flush'
  | 'server_success'
  | 'server_success_with_pending'
  | 'server_network_error'
  | 'server_error'
  | 'connectivity_restored'
  | 'retry'

export type LifecycleEvent =
  | 'open_session'
  | 'load_complete'
  | 'first_edit'
  | 'save_start'
  | 'save_success'
  | 'save_error'
  | 'retry'

// Arbitrary generators

export function arbitraryQuillDelta(): fc.Arbitrary<QuillDelta> {
  const insertOp = fc.record({
    insert: fc.oneof(
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.constant('\n'),
    ),
    attributes: fc.option(
      fc.record({
        bold: fc.option(fc.constant(true), { nil: undefined }),
        italic: fc.option(fc.constant(true), { nil: undefined }),
      }),
      { nil: undefined },
    ),
  })

  return fc
    .array(insertOp, { minLength: 1, maxLength: 20 })
    .map((ops) => ({
      ops: ops.map((op) => {
        const result: Record<string, unknown> = { insert: op.insert }
        if (op.attributes) result.attributes = op.attributes
        return result
      }),
    }))
}

export function arbitraryEdit(): fc.Arbitrary<{
  delta: QuillDelta
  timestamp: number
}> {
  return fc.record({
    delta: arbitraryQuillDelta(),
    timestamp: fc.integer({ min: 1700000000000, max: 1800000000000 }),
  })
}

export function arbitrarySessionState(): fc.Arbitrary<{
  sessionId: string
  delta: QuillDelta
  editTimestamp: number
  cursorPosition: number
  beatPlaybackPosition: number
  beatVolume: number
  beatLooping: boolean
}> {
  return fc.record({
    sessionId: fc
      .string({ minLength: 5, maxLength: 20 })
      .map((s) => `session-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`),
    delta: arbitraryQuillDelta(),
    editTimestamp: fc.integer({ min: 1700000000000, max: 1800000000000 }),
    cursorPosition: fc.integer({ min: 0, max: 1000 }),
    beatPlaybackPosition: fc.float({ min: 0, max: 300, noNaN: true }),
    beatVolume: fc.float({ min: 0, max: 1, noNaN: true }),
    beatLooping: fc.boolean(),
  })
}

export function arbitrarySaveEvent(): fc.Arbitrary<SaveEvent> {
  return fc.constantFrom(
    'edit',
    'debounce_expire',
    'periodic_flush',
    'manual_flush',
    'server_success',
    'server_success_with_pending',
    'server_network_error',
    'server_error',
    'connectivity_restored',
    'retry',
  )
}

export function arbitraryLifecycleEvent(): fc.Arbitrary<LifecycleEvent> {
  return fc.constantFrom(
    'open_session',
    'load_complete',
    'first_edit',
    'save_start',
    'save_success',
    'save_error',
    'retry',
  )
}
