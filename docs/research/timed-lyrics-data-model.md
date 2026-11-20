# Timed lyrics: data model and classic/new compatibility

Status: draft for Juan's review. No app code written yet.
Related: `lyrics-on-the-timeline.md` (research notebook, decisions, prototype results).

## Goal

Let each lyric line carry a time in the beat, plus a small list of sections that describe the beat's tempo and structure. A new editor ("Try new") shows and edits that data. The classic editor keeps working on the same sessions. A user can switch between the two at any moment with no conversion and no data loss.

## What is stored

Everything lives in the session's existing `sessions/<id>/script.json`. It inherits autosave, `If-Match` conflict detection, S3 versioning, backups and cleanup on delete. No new tables, no backend change.

Current format: `{ delta, editTimestamp }`. New format adds one optional field:

```json
{
  "delta": { "ops": [
    { "insert": "Woke up with the beat on loop" },
    { "insert": "\n", "attributes": { "time": "8720" } },
    { "insert": "Notebook full but the hook still missin'\n" }
  ]},
  "editTimestamp": 1763541000000,
  "timing": {
    "v": 1,
    "beatId": "dietrying",
    "audioVersion": 1,
    "durationMs": 200000,
    "sections": [
      { "id": "s1", "name": "Intro", "startMs": 80, "endMs": 8720, "bpm": 111.1,
        "beatsPerBar": 4, "firstBeatMs": 80, "color": "#64748b", "source": "auto" }
    ]
  }
}
```

### Line time
- A Quill block attribute `time` on the line's trailing newline. Whole milliseconds, stored as a string (Quill reads attributes back from the page as strings).
- Optional. No `time` means the line is unplaced.
- This is the only stored fact about where a line sits. Bar, beat, line end and snapping are always computed from it and the sections.
- A suggested spot (the playhead when the user started typing) is not stored in the document. It lives in memory and in the local-only study log, if the user opts in.

### Sections (`timing.sections`)
- One merged list. Each section holds its own name, tempo, beats per bar, bar-grid anchor (`firstBeatMs`), colour and `source` (`auto` or `user`).
- Contiguous and non-overlapping, from 0 to `durationMs`. Adding a section splits an existing one.
- At most 12 sections. A warning shows above 4 tempo changes between neighbours.
- `bpm` 40 to 220, `beatsPerBar` 2 to 7.
- Beat length limit: 20 minutes.
- `audioVersion` records which audio file the times were made against. If the beat is re-encoded (the pending m4a decision), the encoder offset is applied once, and the version is bumped.

### Computed, never stored
Line end time, bar and beat number inside a section, the strip drawing, snapping, the training labels (bar, beat, fraction through the bar).

## Compatibility: classic and new editor

The rule: **one document, two views.** Neither editor converts anything. Both read and write the same `script.json`.

### The problem found while checking
I tested the current editor with a delta that carries a `time` attribute. It silently drops the attribute on load (the test returned a delta with no `time`). So today, opening a timed session in the classic editor and typing anything would erase every line's time on the next autosave. `encodeServerScript` also rebuilds only `{ delta, editTimestamp }`, so it would erase `timing`. Both have to be fixed before the new editor can exist.

### Rules
1. **Shared Quill setup.** One module registers the `time` attribute, the Enter fix (the time stays on one line), and the paste fix (pasted lines carry no time). Both editors use it. The classic editor shows nothing new, but now keeps the times.
2. **Preserve unknown fields.** Saving never rebuilds the file from known fields only. `timing` and any future field pass through unchanged. The classic editor never edits `timing`.
3. **No assumption about order.** Classic can reorder, split and join lines freely, so times may be out of order in the document. The new editor sorts placed lines for its computed values and never assumes document order. Its "pin moves a line into time order" rule only applies to its own actions.
4. **Joined lines.** Backspace joining two timed lines keeps the upper line's time. The lower line's time is lost. This is the prototype's observed behaviour and it applies in both editors.
5. **Switching.** The switch saves pending edits first (autosave flush), then loads the session in the other editor. It follows the usual `If-Match` chain, so a stale tab still gets the conflict banner.
6. **The switch is a per-device setting**, stored in the browser (`editorMode`: `classic` or `timeline`), default `classic`. A "Try new" button in a session turns it on and "Back to classic" turns it off. No backend change and no effect on other devices.
7. **Sessions without timing** open in the new editor with empty sections and no placed lines. The first section the user adds, or an auto-detect result later, fills it.
8. **If the session's beat changes**, line times are kept and sections are reset to one section covering the new beat. Juan's rule (2026-11-19): **before the switch is allowed, the user is told what will happen** (how many lines are placed, that their times now point into a different beat, that sections reset), with a clear cancel. Only shown when the session has placed lines or sections, so plain sessions switch as today.

## Release order

0. **Compatibility release (no visible change).** The shared Quill setup, field preservation, and tests. Shipped on its own, before the new editor exists. Anyone with an older cached copy of the app can still drop `timing` and times until they refresh, so Step 0 goes out first and early.
A. Time on each line, Pin, playing-line highlight (new editor, behind "Try new").
B. Song strip and section editing.
C. Zoomed-in view and dragging.
D. New player controls (2-bar jumps, volume slider, loop).

Auto-detection of tempo is not in these steps. The Beat This! spike is too heavy for a normal Lambda. Until it exists, the user sets each section's tempo by hand.

## Tests (in order of the steps)

Step 0:
- A delta with `time` attributes survives load and save in the classic editor, byte for byte.
- `timing` and an invented future field survive a save from the classic editor.
- The Enter, paste and join cases from the prototype, in the real editor component.
- Autosave, local draft and conflict-detection tests stay green.

Step A onward:
- Pin, re-pin, unpin and Undo.
- Switching classic to new and back, with edits in both, loses nothing.
- Two tabs, one in each editor, produce the conflict banner and not a silent overwrite.
- Beta test: add timed lines, reload, switch editors, reload.

## Decisions (2026-11-19)

Juan accepted the defaults: keep times and reset sections on a beat change (with the warning in rule 8), "Try new" remembered per device, and no hint in the classic editor.

## Step 0 status (2026-11-19)

Built, not deployed:
- `src/services/lineTime.ts` registers the `time` attribute and the Enter and paste guards. The classic editor uses it.
- `script.json` saves now send back every field the editor doesn't edit (`extras` in `services/resume.ts`, `scriptExtras` in the session store). "Use latest" on a conflict adopts the latest copy's extras, the "(my version)" copy keeps this copy's, and "keep mine" keeps all of this copy.
- 12 new tests. With the Enter guard switched off, the 3 Enter tests fail, so they test the real thing.

Known gap: a browser still running the old app until it refreshes can drop times. No session has times yet, so nothing can be lost before Step A.

**Deployed and verified (2026-11-19):** pushed as `037a638`, deploy guard and all 11 deployment checks passed, the live bundle `index-C3Zjg7RC.js` contains the line-time code, the live sign-in page loads with no script errors, and the beta test (save, reopen in a fresh browser) passed against www.fluxury.app.

Classic "keep mine" also overwrites the other copy's line times and sections, by the same rule as its lyrics. The overwritten version stays in S3 version history.

## Step A status (2026-11-20)

**Deployed and verified (2026-11-20):** pushed as `5e391ad`, all 11 deployment checks passed, the live bundle `index-Bwq1MBCk.js` contains the timeline view, the live site loads with no script errors, and the beta test (save, reopen in a fresh browser) passed against www.fluxury.app.

Built and tested locally before the deploy. Same editor and same document as classic; the timeline view only adds UI on top.
- **"✨ Try new" / "Back to classic"** pill next to the session title. Remembered per device (`services/editorMode.ts`).
- **Line times beside each placed line** (`components/LineTimeOverlay.vue`), drawn on top of Quill from each line's measured box, never inside Quill's DOM. Tapping a time jumps the beat there.
- **Playing-line highlight:** the latest line that has started, until the next placed line (or 8 s).
- **Pin** in the player row: places the outlined line at the playhead, moves it into time order among placed lines, and moves the outline to the next unplaced line below. A message names the lyric ("Pinned “Woke up with…” at 0:42") with Undo. One Undo reverts the pin and its move, never earlier typing. **Unpin** appears when the outlined line is pinned.
- The Pin target follows the cursor: the line you tap or are typing.
- No snapping yet: there are no sections until Step B.

Tests: 301 unit and integration tests pass (15 new for Step A), and 2 new browser tests in `tests/e2e/timeline.spec.ts` (demo mode) cover Try new, Pin, Undo, switching back to classic, the remembered choice and a real Return key after a pinned line.

Bug found by the browser test and fixed: tapping a line where the cursor already was fires no selection event, so Pin placed the wrong line.

Open for Juan's review: the Pin message sits just above the player, over the bottom lines of lyrics, for 5 seconds. The old smoke test `Browse beats → start session` fails on its own; it looks for a "Write to this beat" button that moved into the player in `4d12835`.
