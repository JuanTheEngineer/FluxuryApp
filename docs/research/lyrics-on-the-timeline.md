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
