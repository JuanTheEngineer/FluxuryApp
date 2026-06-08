# Requirements Document

## Introduction

Fluxury is a music-writing and rap-session web app whose product thesis is **"open the app and instantly enter creative flow."** Fluxury is not a DAW. The user must be able to start writing within five seconds of opening the app, the beat is part of navigation, autosave must create trust, and anything outside the core writing loop is deferred.

This spec defines the **vertical-slice MVP** — the single magical workflow that everything else will build on:

> Select or resume a beat-session, play the beat, edit lyrics in a Quill-based editor, autosave reliably, refresh or reopen, and resume with zero data loss.

### In Scope

- Beat-aware session entry and resume of the most recent session.
- Inline beat preview while browsing, with the ability to spawn or open a session tied to the previewed beat.
- Session lifecycle state machine covering create, open, edit, save, and resume.
- A minimal, keyboard-first Quill lyrics editor.
- Debounced autosave with periodic flush, blur flush, route-change flush, a visible save status indicator, and a local draft fallback that synchronizes when connectivity returns.
- Beat playback that persists across editor interactions and autosaves.
- Zero-data-loss guarantees defined as a measurable invariant.
- Empty, error, and offline states for the writing loop.
- Lightweight client-side timing hooks for time-to-first-lyric.

### Out of Scope

The following are explicitly out of scope for this spec and MUST NOT generate requirements: real-time collaboration, multi-user editing, sharing links, comments, AI lyric generation, vocal recording, exports, version history rewind, social features, marketplace, advanced auth flows, mobile native app, BPM detection, mood tagging, analytics dashboards, conflict resolution UX beyond last-write-wins.

## Glossary

- **Fluxury_App**: The Vue 3 single-page web application that users open to write lyrics over a beat.
- **Session**: A persisted writing artifact composed of a Quill Delta document, a `beatId` reference, metadata (id, title, timestamps), and last-known playback state.
- **Beat**: A persisted audio asset with metadata (id, title, audio URL) selectable for playback and association with a Session.
- **Session_Browser**: The view that lists existing Sessions and exposes the resume affordance.
- **Beat_Browser**: The view that lists Beats and supports inline preview before committing to a Session.
- **Session_Editor**: The view that hosts the Quill editor, the Beat_Player, and the save status indicator.
- **Beat_Player**: The Howler-backed playback component that remains mounted during editing and exposes play, pause, seek, loop, and volume controls.
- **Lyrics_Editor**: The Quill 2.x editor instance inside the Session_Editor, bound to a Quill Delta document.
- **Quill_Delta**: The structured JSON document representation produced and consumed by Quill.
- **Autosave_Engine**: The client subsystem that persists Quill_Delta changes to the server and to the Local_Draft store.
- **Local_Draft**: A per-Session copy of the latest Quill_Delta and metadata persisted in IndexedDB (or localStorage as a fallback) on the user's device.
- **Save_Status**: The user-visible state of the Autosave_Engine, drawn from the set { Idle, Dirty, Saving, Saved, Offline_Saved_Locally, Error }.
- **Session_Lifecycle_State**: The state of a Session in the editor view, drawn from the set { Idle, Loading, Ready, Editing, Saving, Saved, Error }.
- **Resume**: The act of restoring a previously open Session — its Quill_Delta, associated Beat, and best-effort cursor and scroll position — after a page reload, tab close, or navigation away.
- **Time_To_First_Lyric**: The measured client-side duration from app load start to the first successful save of user-authored content in a Session.
- **Last_Write_Wins**: The conflict resolution policy in which the most recent successful write to a Session, ordered by client edit timestamp, supersedes earlier writes.
- **Connectivity**: The state of the browser's ability to reach the Fluxury backend, derived from the browser online signal and from observed request outcomes.

## Requirements

### Requirement 1: Beat-Aware Session Entry

**User Story:** As a writer, I want to land in a session list that surfaces my last session and the available beats, so that I can start writing within seconds of opening the app.

#### Acceptance Criteria

1. WHEN the Fluxury_App finishes loading the Session_Browser, THE Fluxury_App SHALL display the list of the user's existing Sessions ordered by most recently edited first.
2. WHERE at least one Session exists for the user, THE Session_Browser SHALL display a "Resume last session" affordance that opens the most recently edited Session.
3. WHEN the user activates the "Resume last session" affordance, THE Fluxury_App SHALL navigate to the Session_Editor for that Session and begin loading its content.
4. WHEN the Session_Browser first paints, THE Fluxury_App SHALL render the "Resume last session" affordance and the option to start a new Session within 5 seconds of the navigation start event for that view.
5. WHERE no Session exists for the user, THE Session_Browser SHALL display an empty state that links to the Beat_Browser to start a new Session.
6. WHERE at least one Session exists for the user, THE Session_Browser SHALL hide the empty state described in acceptance criterion 5.

### Requirement 2: Unified Beat Preview and Session Selection

**User Story:** As a writer, I want to preview beats inline before committing, so that I can pick the right vibe without losing momentum.

#### Acceptance Criteria

1. WHEN the user activates the preview control on a Beat in the Beat_Browser, THE Beat_Player SHALL begin playback of that Beat without navigating away from the Beat_Browser.
2. WHEN the user activates the preview control on a Beat while no Beat is currently playing, THE Beat_Player SHALL begin playback of the newly selected Beat.
3. WHEN the user activates the preview control on a different Beat while a Beat is already previewing, THE Beat_Player SHALL stop the previously previewing Beat and begin playback of the newly selected Beat.
4. WHEN the user selects "Start new session with this beat" on a Beat in the Beat_Browser, THE Fluxury_App SHALL create a new Session associated with that `beatId` and navigate to the Session_Editor for the new Session.
5. WHERE an existing Session is associated with the selected Beat, THE Beat_Browser SHALL offer an "Open session" action that navigates to the existing Session_Editor instead of creating a duplicate Session.
6. WHEN the user navigates from the Beat_Browser into a Session_Editor, THE Beat_Player SHALL retain its selected Beat and playback state across the navigation.

### Requirement 3: Session Lifecycle State Machine

**User Story:** As a writer, I want the editor's state to be predictable, so that I always know whether the app is loading, ready, saving, or in an error state.

#### Acceptance Criteria

1. THE Session_Editor SHALL represent its state using exactly one value from the Session_Lifecycle_State set { Idle, Loading, Ready, Editing, Saving, Saved, Error } at any given time.
2. WHEN the user opens a Session, THE Session_Editor SHALL transition from Idle to Loading.
3. WHEN the Session_Editor finishes loading the Session content, THE Session_Editor SHALL transition from Loading to Ready.
4. WHEN the user makes the first edit in a Ready Session, THE Session_Editor SHALL transition to Editing.
5. WHEN the Autosave_Engine begins a server write for the current Session, THE Session_Editor SHALL transition to Saving.
6. WHEN a server write completes successfully and no further unsaved edits remain, THE Session_Editor SHALL transition to Saved.
7. IF a server write fails due to a network error, THEN THE Session_Editor SHALL remain in its current Session_Lifecycle_State and SHALL leave Save_Status reflection of the offline condition to the Autosave_Engine.
8. IF a server write fails for a non-network reason, THEN THE Session_Editor SHALL transition to Error and surface a retry affordance to the user.
9. THE Session_Editor SHALL only transition between states using transitions defined in this requirement, and SHALL only execute a transition when the triggering event for that transition has actually occurred.
10. IF a disallowed transition attempt occurs, THEN THE Session_Editor SHALL log a state-machine violation event and SHALL leave the current state unchanged.

### Requirement 4: Quill-Based Lyrics Editor

**User Story:** As a writer, I want a minimal, keyboard-first lyrics editor, so that nothing distracts me from writing.

#### Acceptance Criteria

1. THE Lyrics_Editor SHALL render a Quill 2.x editor bound to the active Session's Quill_Delta.
2. THE Lyrics_Editor SHALL display a toolbar containing at least one editing control and SHALL keep the total number of toolbar controls less than or equal to 8.
3. WHERE the Lyrics_Editor toolbar is rendered, THE Lyrics_Editor SHALL include controls drawn from the set { bold, italic, underline, undo, redo, strike, header, clean }.
4. WHEN the Session_Editor reaches the Ready state, THE Lyrics_Editor SHALL place keyboard focus in the editing surface without further user action.
5. THE Lyrics_Editor SHALL accept text input on viewports with width greater than or equal to 320 CSS pixels without horizontal page scrolling.
6. WHEN the user types a printable character, THE Lyrics_Editor SHALL update the in-memory Quill_Delta to reflect that character within 50 milliseconds of the keystroke event.

### Requirement 5: Debounced and Periodic Autosave

**User Story:** As a writer, I want my work to save itself reliably, so that I never have to think about saving.

#### Acceptance Criteria

1. WHEN an edit occurs in the Lyrics_Editor, THE Autosave_Engine SHALL schedule a server write to occur 1.5 seconds after the most recent edit, replacing any previously scheduled write for the same Session.
2. WHILE the Session is in the Editing state, THE Autosave_Engine SHALL force a server write at least once every 15 seconds, regardless of debounce timing.
3. WHEN the Lyrics_Editor loses keyboard focus, THE Autosave_Engine SHALL force a server write of any unsaved edits before treating the blur event as complete.
4. WHEN the user navigates away from the Session_Editor, THE Autosave_Engine SHALL force a server write of any unsaved edits before unmounting the Session_Editor.
5. WHEN the browser's `beforeunload` event fires, THE Autosave_Engine SHALL persist any unsaved edits to the Local_Draft store before allowing the page to unload.
6. WHEN a Session is reopened immediately after a `beforeunload` Local_Draft persistence, THE Session_Editor SHALL request the latest server-stored Quill_Delta first and SHALL use the Local_Draft Quill_Delta only if the server fetch fails.
7. THE Autosave_Engine SHALL display the current Save_Status to the user with a human-readable label and an elapsed time since the last successful save in every Save_Status value where a successful save has previously occurred.

### Requirement 6: Local Draft Fallback and Offline Save

**User Story:** As a writer, I want my words to be safe even when my connection drops, so that I can keep writing without fear.

#### Acceptance Criteria

1. WHEN an edit occurs in the Lyrics_Editor, THE Autosave_Engine SHALL write the latest Quill_Delta to the Local_Draft store within 500 milliseconds of the edit event.
2. IF a scheduled server write fails due to a network error, THEN THE Autosave_Engine SHALL first confirm that the latest Quill_Delta has been successfully written to the Local_Draft store, and only then SHALL set Save_Status to Offline_Saved_Locally.
3. WHILE Save_Status is Offline_Saved_Locally, THE Autosave_Engine SHALL retry the failed server write each time Connectivity is observed to be restored.
4. WHEN Save_Status transitions to Saved by any means, THE Autosave_Engine SHALL stop retrying server writes for previously offline edits in that Session.
5. WHEN a retry attempt succeeds, THE Autosave_Engine SHALL transition Save_Status to Saved and clear the offline backlog for that Session.
6. WHERE IndexedDB is unavailable in the browser, THE Autosave_Engine SHALL fall back to using localStorage for the Local_Draft store and SHALL log a degraded-storage warning event.

### Requirement 7: Save Status Indicator

**User Story:** As a writer, I want a clear save status indicator, so that I trust the app with my words.

#### Acceptance Criteria

1. THE Save_Status indicator SHALL display exactly one of the following labels at any given time: "Idle", "Saving…", "Saved · just now", "Saved · {n} seconds ago", "Saved · {n} minutes ago", "Offline — saved locally", or "Save failed".
2. WHEN Save_Status changes, THE Save_Status indicator SHALL reflect the new label within 250 milliseconds of the change event.
3. THE Save_Status SHALL only transition between values according to the following rules:
   a. Idle → Dirty when an edit occurs.
   b. Dirty → Saving when the Autosave_Engine begins a server write.
   c. Saving → Saved when a server write completes successfully and no further unsaved edits remain.
   d. Saving → Offline_Saved_Locally when a server write fails due to a network error.
   e. Saving → Error when a server write fails for a non-network reason.
   f. Saved → Dirty when an edit occurs.
   g. Offline_Saved_Locally → Saving when Connectivity returns and a retry begins.
   h. Error → Saving when the user activates the retry affordance.
4. THE Save_Status SHALL NOT transition from Saved back to Idle without an intervening edit.
5. WHEN Save_Status is Saved, THE Save_Status indicator SHALL update its elapsed-time label at least once every 30 seconds while the Session_Editor is mounted, including immediately after the transition into Saved while the label still reads "Saved · just now".

### Requirement 8: Beat Playback During Writing

**User Story:** As a writer, I want the beat to keep playing uninterrupted while I write, so that I stay in flow.

#### Acceptance Criteria

1. WHILE the Session_Editor is mounted, THE Beat_Player SHALL remain mounted and SHALL retain its playback state across all autosave operations.
2. THE Beat_Player SHALL expose controls for play, pause, seek to position, loop toggle, and volume.
3. IF the host browser cannot provide volume control through the Howler audio backend, THEN THE Beat_Player SHALL refuse to load and THE Session_Editor SHALL surface an unsupported-environment error message in place of the Beat_Player.
4. WHEN the user presses the Space key while the Lyrics_Editor does not have keyboard focus, THE Beat_Player SHALL toggle between play and pause.
5. WHEN an autosave server write completes, THE Beat_Player SHALL maintain its current play position within 50 milliseconds of the position at the start of that write.
6. WHEN the user changes the loop or volume control, THE Beat_Player SHALL persist the user-initiated value to the Session's playback state on the next autosave.
7. WHERE a loop or volume change originates from a non-user source such as a system auto-adjustment, THE Beat_Player SHALL NOT persist that change to the Session's playback state.

### Requirement 9: Zero-Data-Loss Invariant

**User Story:** As a writer, I want every keystroke to survive a crash or reload, so that I never lose work.

#### Acceptance Criteria

1. THE Autosave_Engine SHALL ensure that, for every edit accepted by the Lyrics_Editor, the resulting Quill_Delta is written to the Local_Draft store within 500 milliseconds of the edit event, regardless of Connectivity.
2. THE Autosave_Engine SHALL ensure that, for every edit accepted by the Lyrics_Editor, the resulting Quill_Delta is written to the server within 17 seconds of the edit event, except where Connectivity has been lost.
3. WHEN a Session is reopened, THE Session_Editor SHALL load the more recent of the server-stored Quill_Delta and the Local_Draft Quill_Delta, ordered by client edit timestamp under the Last_Write_Wins policy.
4. THE Autosave_Engine SHALL be idempotent with respect to the Quill_Delta payload: applying the same Quill_Delta to the server twice in succession SHALL produce the same server-stored Session content as applying it once.
5. FOR ALL sequences of edits followed by a reload, THE Session_Editor SHALL restore a Quill_Delta that equals the most recently committed edit at the time of reload, where "committed" means written to the Local_Draft store or to the server.

### Requirement 10: Session Resume Determinism

**User Story:** As a writer, I want to close my tab and come back to exactly where I left off, so that resuming feels frictionless.

#### Acceptance Criteria

1. WHEN a Session is reopened after a tab close or page reload, THE Session_Editor SHALL load the same Quill_Delta selected by Requirement 9 acceptance criterion 3.
2. WHEN a Session is reopened, THE Session_Editor SHALL select the Beat referenced by the Session's `beatId` and SHALL load it into the Beat_Player.
3. WHEN a Session is reopened, THE Beat_Player SHALL set its initial play position to the playback position persisted in the Session, and SHALL leave the Beat paused until the user activates play.
4. WHEN a Session is reopened, THE Lyrics_Editor SHALL place the cursor at the persisted cursor position if available, and otherwise SHALL place the cursor at the end of the Quill_Delta.
5. FOR ALL Sessions reopened from the same persisted state, THE Session_Editor SHALL produce the same Quill_Delta, the same selected Beat, and the same initial Beat_Player position.

### Requirement 11: Empty, Error, and Offline States

**User Story:** As a writer, I want the app to tell me clearly what is happening when something is missing or broken, so that I can take the next step.

#### Acceptance Criteria

1. WHERE no Session is currently selected, THE Session_Editor SHALL display a "No Song Selected" empty state with an action that opens the Beat_Browser.
2. IF a Session fails to load from the server, THEN THE Session_Editor SHALL transition to the Error state and SHALL display a retry affordance and a human-readable error message.
3. IF an autosave server write fails, THEN THE Save_Status indicator SHALL display either "Offline — saved locally" for network errors or "Save failed" for non-network errors, and SHALL continue to display that failure status even when no new edits have been made since the last successful save, until a subsequent autosave succeeds.
4. WHEN the user activates the retry affordance after a non-network save failure, THE Autosave_Engine SHALL re-attempt the server write for the most recent unsaved Quill_Delta.
5. WHILE Connectivity is lost, THE Session_Editor SHALL display a non-blocking offline indicator and SHALL continue to accept edits.

### Requirement 12: Time-to-First-Lyric Instrumentation

**User Story:** As a product owner, I want lightweight client-side timing data, so that I can verify the five-second flow promise without depending on a third-party analytics SDK.

#### Acceptance Criteria

1. WHEN the Fluxury_App begins loading, THE Fluxury_App SHALL record a `app_load_start` timestamp using the browser performance clock.
2. WHEN the Beat_Player first emits audible playback for a Session, THE Fluxury_App SHALL record a `beat_audible` timestamp.
3. WHEN the Lyrics_Editor first receives keyboard focus for a Session, THE Fluxury_App SHALL record an `editor_focused` timestamp.
4. WHEN the Autosave_Engine completes the first successful server write of user-authored content for a Session, THE Fluxury_App SHALL record a `first_save_success` timestamp.
5. WHERE the recorded `first_save_success` timestamp is later than the recorded `app_load_start` timestamp, THE Fluxury_App SHALL compute Time_To_First_Lyric as `first_save_success` minus `app_load_start`.
6. WHERE no successful first save has occurred for the current app load, THE Fluxury_App SHALL report Time_To_First_Lyric as the placeholder value 0.
7. IF the recorded `first_save_success` timestamp is earlier than or equal to the recorded `app_load_start` timestamp, THEN THE Fluxury_App SHALL report Time_To_First_Lyric as the placeholder value 0 and SHALL log a clock-ordering warning event.
8. THE Fluxury_App SHALL expose the recorded timestamps and the computed Time_To_First_Lyric value through a client-side debug interface that does not transmit data to any third-party service.
