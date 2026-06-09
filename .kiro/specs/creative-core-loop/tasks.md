# Implementation Plan: Creative Core Loop

## Overview

This plan implements Fluxury's vertical-slice MVP — the debounced autosave engine, local draft persistence layer, connectivity detection, session lifecycle state machine, save status indicator, BeatPlayer enhancements, timing metrics, and the full SessionEditorView refactor that replaces the existing 10-second `setInterval` with a deterministic state-machine-driven architecture.

All tasks target TypeScript in a Vue 3 + Vitest + Pinia project. Property-based tests use `fast-check` with `fake-indexeddb` for storage simulation.

## Tasks

- [x] 1. Infrastructure setup
  - [x] 1.1 Install dev dependencies and create test utilities
    - Add `fast-check` (^3.22.0) and `fake-indexeddb` (^6.0.0) to devDependencies
    - Create `src/test-utils/generators.ts` with fast-check arbitraries: `arbitraryQuillDelta()`, `arbitraryEdit()`, `arbitrarySessionState()`, `arbitrarySaveEvent()`, `arbitraryLifecycleEvent()`
    - Create `src/test-utils/fakeStorage.ts` with IndexedDB mock setup using fake-indexeddb
    - Update `tests/setup.ts` to register fake-indexeddb globally for test environment
    - _Requirements: Design Testing Strategy_

- [x] 2. Local Draft service
  - [x] 2.1 Implement `localDraft.ts` service with IndexedDB + localStorage fallback
    - Create `src/services/localDraft.ts` implementing `LocalDraftService` interface
    - Implement `get(sessionId)`, `set(draft)`, `delete(sessionId)`, `isAvailable()` methods
    - Primary storage: IndexedDB object store `fluxury-drafts` via manual IDB wrapper (no idb-keyval needed)
    - Fallback: localStorage with key pattern `fluxury-draft-{sessionId}` and JSON serialization
    - Detection: attempt IndexedDB open on init; on failure, log `degraded-storage` warning and fall back
    - Handle localStorage quota exceeded by evicting oldest draft for a different session
    - _Requirements: 6.1, 6.6, 9.1_

  - [x] 2.2 Write property tests for Local Draft service
    - **Property 8: Local draft written within 500ms of every edit**
    - Use fake-indexeddb and fake timers to verify write timing guarantee
    - Test both IndexedDB path and localStorage fallback path
    - Test round-trip: set then get returns identical data
    - Test eviction logic when quota exceeded
    - **Validates: Requirements 6.1, 9.1**

- [x] 3. Connectivity composable
  - [x] 3.1 Implement `useConnectivity.ts` composable
    - Create `src/composables/useConnectivity.ts` implementing `UseConnectivityReturn` interface
    - Seed from `navigator.onLine`
    - Listen to `window` `online`/`offline` events
    - Expose `isOnline` ref, `onReconnect(callback)`, `offReconnect(callback)` methods
    - On API request failure with network error signature → set `isOnline = false`
    - On `online` event or successful API response → set `isOnline = true`, fire `onReconnect` callbacks
    - Cleanup listeners on composable destroy
    - _Requirements: 6.3, 11.5_

  - [x] 3.2 Write unit tests for `useConnectivity`
    - Test initial state mirrors `navigator.onLine`
    - Test transitions on `online`/`offline` window events
    - Test `onReconnect` callback fires on transition from offline → online
    - Test `offReconnect` removes callback
    - Test cleanup removes all window listeners
    - _Requirements: 6.3, 11.5_

- [x] 4. Autosave Engine composable
  - [x] 4.1 Implement `useAutosave.ts` composable with Save Status state machine
    - Create `src/composables/useAutosave.ts` implementing `UseAutosaveOptions` and `UseAutosaveReturn`
    - Implement Save Status state machine: idle → dirty → saving → saved / offline_saved_locally / error
    - On delta change: write Local_Draft within 500ms, set status `dirty`, reset debounce timer (1.5s)
    - On debounce expiry: attempt server write via `saveFn`
    - Periodic flush: force server write every 15s while dirty
    - Flush triggers: blur event, `beforeRouteLeave`, `beforeunload`
    - On server success: set status `saved`, record `lastSavedAt`
    - On network error: confirm local draft written, set `offline_saved_locally`
    - On non-network error: set status `error`
    - On connectivity restored while `offline_saved_locally`: retry server write
    - Transition from `saving` → `dirty` if new edits arrived during save
    - `flush()`: force immediate server write of current delta
    - `destroy()`: cleanup all timers, listeners, intervals
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 7.3, 7.4_

  - [x] 4.2 Write property tests for Save Status state machine correctness
    - **Property 5: Save_Status state machine correctness**
    - Generate arbitrary sequences of save events (edit, debounce_expire, server_success, server_network_error, server_error, connectivity_restored, retry)
    - Verify status is always one of the valid set
    - Verify every transition follows rules from Requirement 7.3
    - Verify `saved` never transitions to `idle` without intervening edit
    - **Validates: Requirements 7.1, 7.3, 7.4**

  - [x] 4.3 Write property tests for debounce and periodic flush timing
    - **Property 6: Debounced save fires 1.5s after last edit**
    - Use fake timers; generate arbitrary edit sequences with varying intervals
    - Verify server write initiates at T+1.5s (±50ms) after last edit when no further edits occur
    - **Property 7: Periodic flush within 15s**
    - Verify that if session is dirty and online, a server write occurs within 15s of last write
    - **Validates: Requirements 5.1, 5.2**

  - [x] 4.4 Write property tests for local draft timing and server write timing
    - **Property 8: Local draft written within 500ms of every edit**
    - Generate arbitrary edit events, verify Local_Draft contains result within 500ms using fake timers
    - **Property 9: Server write within 17s of edit (when online)**
    - Generate edits while online, verify server write completes within 17s
    - **Validates: Requirements 6.1, 9.1, 9.2**

  - [x] 4.5 Write property test for autosave idempotency
    - **Property 11: Autosave idempotency**
    - Generate arbitrary valid QuillDelta, call `saveFn` twice with same payload
    - Verify server-stored content is identical after both calls
    - **Validates: Requirements 9.4**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Save Status component
  - [x] 6.1 Implement `SaveStatus.vue` component
    - Create `src/components/SaveStatus.vue` with props: `status`, `lastSavedAt`, `onRetry`
    - Render exactly one label based on status: "Idle", "Saving…", "Saved · just now", "Saved · {n} seconds ago", "Saved · {n} minutes ago", "Offline — saved locally", "Save failed"
    - 30-second `setInterval` updates elapsed-time display while status is `saved`
    - Show retry button when status is `error`
    - Reflect label change within 250ms of status change (reactive binding)
    - Cleanup interval on unmount
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 6.2 Write unit tests for `SaveStatus.vue`
    - Test all 6 label states render correct text
    - Test elapsed time formatting: "just now" → "30 seconds ago" → "1 minute ago" → "2 minutes ago"
    - Test retry button visible only in error state and fires `onRetry`
    - Test interval cleanup on unmount
    - _Requirements: 7.1, 7.2, 7.5_

- [x] 7. Session lifecycle state machine
  - [x] 7.1 Implement session lifecycle state machine utility
    - Create `src/composables/useSessionLifecycle.ts` (or inline in SessionEditorView)
    - Define `SessionLifecycleState` type and `VALID_TRANSITIONS` map
    - Implement `transition(currentState, targetState)` function that returns new state or logs violation and returns unchanged state
    - Log `state-machine-violation` with current state + attempted event on invalid transition
    - Expose reactive `state` ref and `transition(event)` method
    - _Requirements: 3.1, 3.9, 3.10_

  - [x] 7.2 Write property tests for session lifecycle state machine
    - **Property 4: Session lifecycle state machine correctness**
    - Generate arbitrary sequences of lifecycle events starting from `idle`
    - Verify state is always exactly one value from the valid set
    - Verify every transition is a member of the valid transition set
    - Verify invalid transitions are rejected without changing state
    - **Validates: Requirements 3.1, 3.9, 3.10**

- [x] 8. BeatPlayer enhancements
  - [x] 8.1 Add `beat-audible` emit, resume props, and playback state emit to BeatPlayer
    - Add `emit('beat-audible')` fired on first `onplay` callback per session load
    - Add `initialPosition` prop (seconds): seek to position on mount, stay paused
    - Add `initialVolume` prop: set volume on mount instead of default 0.8
    - Add `initialLoop` prop: set loop state on mount
    - Add `emit('update:playbackState', { position, volume, looping })` emitted on play/pause/seek/volume/loop change
    - Filter non-user changes: only emit `update:playbackState` on user-initiated interactions (not programmatic seeks on mount)
    - _Requirements: 8.1, 8.5, 8.6, 8.7, 10.3, 12.2_

  - [x] 8.2 Write unit tests for BeatPlayer enhancements
    - Test `beat-audible` fires exactly once per session mount on first play
    - Test `initialPosition` prop seeks on mount without playing
    - Test `initialVolume` and `initialLoop` override defaults
    - Test `update:playbackState` emits on user volume/loop change
    - Test non-user source changes (programmatic) do NOT emit `update:playbackState`
    - _Requirements: 8.5, 8.6, 8.7, 12.2_

- [x] 9. SessionEditorView refactor
  - [x] 9.1 Refactor SessionEditorView to use `useAutosave`, `useSessionLifecycle`, and `localDraft`
    - Remove the existing `setInterval` 10-second save loop entirely
    - Integrate `useSessionLifecycle` for state machine (idle → loading → ready → editing → saving → saved → error)
    - Integrate `useAutosave` composable — wire Quill's `text-change` event to `onDeltaChange`
    - Integrate `useConnectivity` for offline indicator display
    - On session open: fetch server delta AND local draft, compare `editTimestamp`, pick newer (Last_Write_Wins)
    - Load Quill with selected delta, transition to `ready`, auto-focus editor
    - Wire blur flush, route-change flush via `onBeforeRouteLeave`
    - Wire `beforeunload` to write Local_Draft synchronously
    - Display `SaveStatus.vue` component replacing the old `<p>` status text
    - Add Space-key toggle for BeatPlayer when editor not focused (keydown listener on view)
    - Add non-blocking offline indicator when `isOnline` is false
    - Show error state with retry affordance on non-network failures
    - Show "No Song Selected" empty state when no session is selected
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 8.4, 9.3, 10.1, 10.2, 10.4, 11.1, 11.2, 11.3, 11.5_

  - [x] 9.2 Write unit tests for SessionEditorView refactored behavior
    - Test lifecycle transitions: idle → loading → ready → editing on first keystroke
    - Test Last_Write_Wins: server delta selected when server timestamp newer
    - Test Last_Write_Wins: local draft selected when local timestamp newer
    - Test Space-key toggles BeatPlayer play/pause when editor not focused
    - Test Space-key does NOT toggle BeatPlayer when editor focused (inserts space instead)
    - Test error state renders retry affordance
    - Test empty state when no session selected
    - Test offline indicator visible when `isOnline` false
    - _Requirements: 3.2, 3.4, 5.6, 8.4, 9.3, 11.1, 11.2, 11.5_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Resume flow
  - [x] 11.1 Implement resume logic with Last_Write_Wins, cursor restore, and beat state restore
    - In SessionEditorView: on session open, fetch server `PersistedSessionScript` and `localDraft.get(sessionId)`
    - Compare `editTimestamp` fields — select delta with higher timestamp (server wins on tie)
    - Restore `cursorPosition` from selected source — place cursor at persisted offset, or end-of-document if unavailable
    - Restore BeatPlayer state: pass `initialPosition`, `initialVolume`, `initialLoop` from persisted `playbackState`
    - BeatPlayer starts paused on resume, user activates play
    - Wire `update:playbackState` from BeatPlayer into `useAutosave` so it persists on next save
    - _Requirements: 9.3, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 11.2 Write property tests for resume flow
    - **Property 10: Last_Write_Wins — newer timestamp delta selected on resume**
    - Generate arbitrary pairs of (server delta + timestamp, local delta + timestamp)
    - Verify the delta with max timestamp is selected; server wins on tie
    - **Property 12: Zero-data-loss round-trip**
    - Generate arbitrary edit sequences, simulate reload, verify restored delta equals last committed edit
    - **Property 13: Resume determinism**
    - Generate arbitrary persisted session state, resume twice, verify identical editor state both times
    - **Validates: Requirements 9.3, 9.5, 10.1, 10.5**

- [x] 12. Timing metrics
  - [x] 12.1 Implement `useTimingMetrics.ts` composable
    - Create `src/composables/useTimingMetrics.ts` implementing `UseTimingMetricsReturn`
    - `recordAppLoadStart()`: records `performance.now()` anchored to `performance.timeOrigin`
    - `recordBeatAudible()`: records timestamp on first `beat-audible` event per session
    - `recordEditorFocused()`: records timestamp on first editor focus per session
    - `recordFirstSaveSuccess()`: records timestamp on first successful server write per session
    - Compute `timeToFirstLyric`: `firstSaveSuccess - appLoadStart` when both > 0 and first > start; else 0
    - Log `clock-ordering` warning if `firstSaveSuccess <= appLoadStart`
    - Expose via `window.__fluxury_metrics` for debugging (no third-party transmission)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [x] 12.2 Wire timing metrics into SessionEditorView and app entry
    - Call `recordAppLoadStart()` in `main.ts` or App.vue on app init
    - Listen for `beat-audible` from BeatPlayer → call `recordBeatAudible()`
    - Listen for Quill editor focus → call `recordEditorFocused()`
    - Listen for first successful save from `useAutosave` → call `recordFirstSaveSuccess()`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 12.3 Write property tests for TTFL computation
    - **Property 14: Time-to-First-Lyric computation correctness**
    - Generate arbitrary pairs (app_load_start, first_save_success) including edge cases
    - Verify TTFL = first_save_success − app_load_start when both > 0 and first > start
    - Verify TTFL = 0 for null values, negative differences, or equal timestamps
    - **Validates: Requirements 12.5, 12.6, 12.7**

- [x] 13. Integration verification
  - [x] 13.1 Write integration tests for full edit → autosave → reload → resume cycle
    - Test: type lyrics → wait debounce → verify server write → simulate reload → verify same delta restored
    - Test: type offline → verify local draft saved → simulate reconnect → verify server sync
    - Test: rapid edits → verify single debounced save (not per-keystroke)
    - Test: blur editor → verify immediate flush before blur completes
    - Test: `beforeunload` → verify local draft written synchronously
    - _Requirements: 5.1, 5.3, 5.5, 6.2, 6.3, 9.2, 9.5, 10.1_

  - [x] 13.2 Update Playwright E2E tests for the creative core loop
    - Add E2E test: open app → resume last session → type → see "Saved" status
    - Add E2E test: open app → browse beats → preview → start session → editor loads
    - Add E2E test: verify Session_Browser first-paint under 5s
    - Update any existing E2E tests broken by SessionEditorView refactor
    - _Requirements: 1.4, 2.4, 9.5_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The existing 10-second `setInterval` in SessionEditorView is **replaced entirely** — not augmented.
- Property tests are **required** (not optional) — they are the core validation for this spec's correctness guarantees.
- No changes to `SessionBrowserView` or `BeatBrowserView` — those views are consumed as-is.
- No visual/theme changes — only structural behavior changes.
- No CI/CD work — all tasks are code-writing tasks.
- Each property test references a specific property from the design document's Correctness Properties section.
- `idb-keyval` is NOT needed — the localDraft service implements its own minimal IndexedDB wrapper for a single object store.
- The `PersistedSessionScript` format embeds playback state inside the existing `script` JSON blob field.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "7.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "6.1", "8.1"] },
    { "id": 4, "tasks": ["4.5", "6.2", "8.2", "12.1"] },
    { "id": 5, "tasks": ["9.1"] },
    { "id": 6, "tasks": ["9.2", "11.1", "12.2"] },
    { "id": 7, "tasks": ["11.2", "12.3"] },
    { "id": 8, "tasks": ["13.1"] },
    { "id": 9, "tasks": ["13.2"] }
  ]
}
```
