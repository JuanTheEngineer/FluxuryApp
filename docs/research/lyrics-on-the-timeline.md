# Research notebook: lyrics on the beat's timeline

Owner: Juan. Started 2026-11-18. Status: design under review, nothing built in the app.
This is the shared record for every session working on Fluxury. Read it before touching bars, beats, the player or AI writing.

## The customer problem (Juan, 2026-11-18)

A rapper loops a beat, finally gets a line down, and wants it saved at its place in the song, without breaking their writing flow.
- The smallest unit is **one line** (as in Spotify's synced lyrics). The rapper may decide how long a line lasts.
- Beats can switch up mid-song (different tempo), and some parts have no lyrics (instrumental).
- Songs are long: the rapper needs a **bird's-eye view** of which parts already have lyrics, especially while moving lines around.
- Writing must stay easy. Placing lines must never get in the way.

## Design direction (not approved yet)

- A line is pinned to a **time in the audio** (seconds). Lines without a time are valid. There is **no single BPM per beat**: tempo is read locally from detected beat times, so beat switch-ups work.
- Beats and bars are only a **snapping aid**, used where detection is confident.
- Placing, from most automatic to most manual: an automatic guess (the playhead when you start a line), stamp ("this line starts now"), drag on a timeline.
- **Overview strip**: the whole song, sections in soft colours, filled where lines are placed.
- Playback highlights the current line.
- Juan's worry (2026-11-18): too many numbers (timestamps, bar numbers) and the zoomed-in view may be too complex. Default view should hide numbers; the zoomed-in view is a later phase.
- Mockup v1: rendered in the dashboard chat on 2026-11-18 (strip, 4-bar zoom, editor gutter, stamp button). Missing: room for artwork, dragging, phone versus laptop.
- Juan's review of v1/v2 (2026-11-18): v1 is the base. Keep the stack of lines, the top strip and the zoomed-in view ("I love that"). Keep v2's artwork and session title. "b6" was unclear: count bars inside each section ("Verse 1 · bar 2"). Doesn't like the word "stamp"; it's a placeholder name. Stamp's purpose wasn't clear in v2.
- Bars per section *(Juan)*: don't assume 4 beats per bar. Each section has its own tempo and beats per bar, auto-detected where possible and settable by the user. A beat switch-up is handled by ending one section and starting another. Section colours are auto-assigned or picked by the user.
- Open: work backwards from the **data model** before building anything, to make sure the UI is implementable (Juan, 2026-11-18).
- Juan's review of v3 (2026-11-18). Mobile first: screen space and thumb reach matter. He reads the screen as 5 areas:
  1. Session info: artwork, session name, beat name, and the producer in a faded font with a link (YouTube).
  2. Whole-song strip ("very well designed"). The section pills shouldn't always show; open them on demand to check or add sections.
  3. Zoomed-in view that follows the playhead. Easy to hide and show. Hidden, it must take little space but still be findable by someone who has never seen it.
  4. Lyrics: lines always stay in time order. "Type your next line" is fine.
  5. Playback: beat artwork as its background. Jump back/forward by bars instead of 5 seconds, plus scrubbing. Buttons must be high quality, modern and principled.

## Scope limits (Juan, 2026-11-18)

- Up to 3 beat switch-ups is normal. From 4, warn that snapping may be off.
- Beats can't be longer than 20 minutes (enforce at upload).

## Spike 1: can we find beats and bars automatically? (2026-11-18)

Method: Beat This! (CPJKU, 2024, `final0` checkpoint, `dbn=False`) for beat and downbeat times; librosa `beat_track` as a tempo cross-check. No ground truth, so errors were judged by beats per bar (expect 4), bar-length jitter, tempo agreement, and click tracks for listening.

| Beat | Length | BPM (Beat This! / librosa) | Bars | 4-beat bars | Jitter |
|---|---|---|---|---|---|
| dietrying | 200s | 111.1 / 110.0 | 87 | 100% | 10 ms |
| Make Them Pay | 302s | 81.1 / 161.5 | 102 | 99% | 74 ms |
| future-metro-ice | 160s | 73.2 / 143.6 | 49 | 100% | 10 ms |
| drake-pnd-time | 216s | 88.2 / 89.1 | 81 | 90% | 256 ms |
| lucki-future-forlove | 215s | 78.9 / 156.6 | 75 | 84% | 568 ms |
| kodak-drake-2025 | 265s | 81.1 / 107.7 | 96 | 79% | 650 ms |

Findings:
- Reliable wherever drums play. Errors cluster in intros and drum-less breaks.
- librosa doubles the tempo on 3 beats (normal half/double ambiguity); kodak (81 vs 108) is unresolved.
- Tempo drifts even on clean beats (up to 299 ms from a constant-tempo fit over 200 s): store detected times, not "BPM + offset".
- Cost: 53 s CPU and 1.8 GB memory for all 6 beats. Too heavy for a normal Lambda; run offline or in a large container.
- Blind spot: the metrics can't detect a bar start placed one beat off. Only listening can.
- Not tested: a beat with a real tempo switch-up. Need 1–2 such beats.
- 5 of 6 beat files are Opus in WebM despite the `audio.wav` name.
- Pending: Juan's listening check of the click tracks. Code and clips were in session scratch (not committed).

## Juan's long-term research goal: language models that know where words fall in the beat

Train models on rap where every token also carries its position in time: bar number and position inside the bar, not only position in the song. Possibly new tokens for line and bar boundaries.
Consequence for Fluxury's data model, now: store each line's exact time and the beat grid it was placed against, so bar and beat positions can be derived later. Word-level timing can come from recorded takes (Release 5, voice) aligned to the audio.
Ethics: training on testers' lyrics needs their explicit consent. Decide this before collecting anything.

## Hypotheses to test

- H1: the playhead position when a line is started predicts where it gets placed (error in seconds versus manual stamps).
- H2: snapping to detected beats reduces stamp error (milliseconds).
- H3: a repetition score separates beats from non-beats (needs ~50 of each).

## HCI method (Georgia Tech CS 6750)

Follow the course's design life cycle: needfinding, design alternatives, prototypes, evaluation, repeat. Readings that apply directly (from the [CS 6750 Fall 2023 reading list](https://omscs6750.gatech.edu/fall-2023/required-reading-list/)):
- Norman 1986, *Cognitive engineering*; Norman 2013, DOET ch. 2: gulfs of execution and evaluation. Stamping must show its result instantly.
- Hutchins, Hollan & Norman 1985, *Direct manipulation interfaces*: dragging lines on the timeline.
- MacKenzie 2013, ch. 2 *The Human Factor*: tap timing limits, the reason for snapping.
- Norman 2013, DOET ch. 5; MacKenzie §3.8 *Interaction errors*: slips such as stamping the wrong line; undo.
- Hutchins 1995, *How a cockpit remembers its speeds*; Liu, Nersessian & Stasko 2008: the overview strip as the notebook's external memory.
- Nardi 1992, activity theory / situated action / distributed cognition: study how rappers actually write before designing more.
- Houde & Hill 1997, *What do prototypes prototype?*: mockup v1 tests role and look, not implementation.
- Nielsen & Molich 1990, heuristic evaluation; Polson, Lewis, Rieman & Wharton 1992, cognitive walkthrough: evaluate each prototype before building.
- MacKenzie 2013, ch. 4–5: experiment design for H1–H3.
- Friedman et al. 2013, *Value Sensitive Design*; Winner 1980: lyrics ownership and AI-training consent.

## Mockup v4 review (2026-11-19)

Decisions from Juan:
- Jump size: fixed at 2 bars. No adjustable control.
- No left-handed mirroring setting.
- Volume: a speaker icon that shows muted or unmuted state. Tap opens a vertical slider. It closes when tapped outside or shortly after a pick.
- The loop icon looked like a restart button. Replace it with the standard repeat icon and a "LOOP" label.
- The pin emoji is out. Use a drawn icon instead.
- Bar and beat display: keep as is.

## Decisions after the v5 review (2026-11-19)

Juan's answers on the data model and the interface:
- **Pin keeps its name.** The pin emoji is replaced by a drawn icon, loop uses the standard repeat icon, jump size is fixed at 2 bars, and there is no left-handed mirror setting. The bar and beat display stays as it is.
- **Volume:** a speaker icon in the time row that shows muted or unmuted state. Tapping it opens a vertical slider. It closes on a tap outside or about 1.5 seconds after the last drag.
- **No scrollbar on the lyrics list.** The strip shows the position. A half-visible last line signals that the list scrolls.
- **The strip needs no "whole song" label.** A "drag to scrub" hint shows only until the first drag. The fallback name is "Song map" if testers get lost.
- **Reordering:** typing never moves a line. Pinning or dragging a line moves it into time order among the placed lines, and Undo reverses that. Unplaced lines stay where they were typed.
- **Sections: merged model.** Every section holds its own name, tempo, beats per bar and colour, and there is an "apply tempo to all sections" button. The split model (separate tempo list and label list) stays an option if testers find editing tedious.
- **Limits:** 12 sections, and a warning at more than 4 tempo changes.
- **Editor:** keep Quill. The fallback is a stored list of lines, each with its own text and time, only if the prototype below had failed.
- **Data model:** a line's time in whole milliseconds is the only stored fact about placement. Bar, beat, line end and snapping are computed. Sections live in the session's `script.json`, so they inherit autosave, `If-Match` conflict detection and versioning.

## Quill prototype results (2026-11-19)

**Method.** A throwaway page in `fluxury-app/spikes/quill-line-time/` stores each line's time as a Quill block attribute (`time`, in milliseconds) and draws a side column of marks and section headings from each line's measured on-screen box. 13 browser tests in `fluxury-app/tests/spike/quill-line-time.spec.ts` run in Chromium with iPhone 13 emulation. Run them with `npx playwright test --config playwright.spike.config.ts`.

**Results: 13 of 13 pass.**

| Question | Result |
|---|---|
| Does the time survive save and load as JSON? | Yes. The time is stored as `{"insert":"\n","attributes":{"time":"8720"}}`, a string in the delta. |
| Enter at the end, middle and start of a timed line | The time stays on exactly one line in all three. At the start, the new empty line above stays untimed. |
| Pasting HTML that carries times | The times are dropped. A pasted line has no placement. |
| Moving a line (up, and to the end) | Text and time travel together. Undoing both moves restores the document byte for byte. |
| Pin, re-pin and unpin through a Quill format call | Works. |
| Marks and headings aligned within 1 px of their lines | Yes, at 390x700, 320x560, landscape 700x390 and keyboard-open 390x330, scrolled to the top, middle and bottom, and while typing in a line that wraps. |
| Backspace joining two timed lines (observed, not asserted) | The first line keeps its time, and the second line's time is lost silently. |

**Bugs the tests caught, and fixes:**
1. A moved line's newline looks the same as an Enter copy. Moves now use the `api` source, which the Enter fix ignores.
2. Undo of a move was read as a paste and cleared the times. Paste handling moved into a clipboard matcher, and Enter is recognised only when one inserted newline carries a time and the next line holds the same time.
3. The marks lagged one row (about 18 px) when measured immediately after a viewport resize. The real build must re-measure on the next animation frame after a resize.

**Not covered:**
- Real iPhone Safari (WebKit). Only Chromium was tested.
- Phone keyboards that don't send Enter as a key event. The Enter fix reads the document change and not key events, so it should hold, but it isn't proven.
- Quill's Delta format with very long lyrics, and the rest of the real editor (toolbar, autosave).

**Recommendation.** Keep Quill. Verify on a real iPhone before building the real screen.

## iPhone check (2026-11-19)

Juan opened the readable test page (`9000268`) in Safari on his iPhone. Marks and wrapped lines lined up, and he reported the Return-key check works. The Quill approach holds on a real iPhone. Not separately checked: Return in the middle and at the start of a line, rotation, and dictation.
