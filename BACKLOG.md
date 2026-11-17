# Fluxury Release Plan

Organized by release. Each release has a goal and an exit criterion; within a release, items are listed in the order to do them. Batch letters (A–I) are kept so older commits and notes still line up.
Kiro keeps this file up to date as new issues come up in chat.

**Blocking right now:** nothing. Live site verified 2026-11-17 (save, reopen, conflicts, delete, opening without flashes).

**Why this order:** first make the beta safe to hand to someone else, then stop testing on the environment users use, then make it look like a product and invite testers, then let their feedback decide what's next. Voice and AI come once the core is stable.

---

## Release 1 — Trustworthy beta (now, ~1 day)

**Goal:** safe to invite the first people who aren't you. Nothing we do can destroy a writer's lyrics, sign-in is clean, and a new user lands on working beats.
**Done when:** every item below is checked, the beta test passes live, and you'd send the link to a friend.

- [ ] **Stack deletion still wipes all data** (A, M): tables and bucket use `RemovalPolicy.DESTROY`, and the bucket has `autoDeleteObjects`, so `cdk destroy` or a stack replacement deletes every session and lyrics file. PITR and versioning don't survive that. Switch to `RETAIN` for the data resources; removing `autoDeleteObjects` safely needs a careful CDK check first.
- [ ] **Write a restore runbook** (A, S): how to restore an old `script.json` version, and how to do a PITR restore of the sessions table. A backup nobody knows how to restore doesn't help much.
- [ ] **Investigate a `cognito-idp` 400 on page load** (B, S): it appears in the console on every open. Find out whether it's a harmless token-refresh miss or a real auth bug that could sign people out.
- [ ] **Beat seeding** (S): confirm all 5 beats exist in the live backend. A new user with no beats has nothing to write to.
- [ ] **Session deleted while open elsewhere** (F, S): a tab or device that still has it open gets a generic "Save failed" (S3 `If-Match` on a deleted file returns 404). Should say "This session was deleted" and offer to save the lyrics as a new session.
- [ ] **Deploy guard** (C, S): `deploy.sh` refuses to run from a dirty or unpushed tree (local, git and live drifted before).
- [ ] **18 orphaned lyrics folders in S3** (F, S, **needs your OK**: it's a production delete): from sessions deleted before the cleanup fix (mostly old beta test runs; 2 real sessions remain). A few KB in total. Delete `sessions/<id>/` for any id with no DynamoDB record; versioning keeps them 30 days anyway.

---

## Release 2 — Ship safely (~1 day, enabler)

**Goal:** stop testing on the only environment, which users also use, before the biggest UI change in Release 3.
**Done when:** every push runs CI, and changes reach fluxury.app only after passing on a dev stack.

- [ ] **Separate `dev` stack** (C, L): parameterize the CDK stack name and origins, deploy `FluxuryDev` next to `FluxuryBeta`.
- [ ] **GitHub Actions CI** (C, L): typecheck, unit tests, CDK synth and assertion tests, then deploy to dev and run the beta test against it.
- [ ] **Stop committing build output** (D, S): `fluxury-app/test-results/.last-run.json` is tracked even though `test-results/` is now gitignored; `git rm --cached` it.
- [ ] **Stop committing build output (infra)** (D, S): `fluxury-infra/lib/*.js` next to the `.ts` files, `cdk.out`, `cookies.txt`. The stale `lib/beta-stack.js` made Jest test old code on 2026-11-14 (worked around via `moduleFileExtensions`). Delete the stale `.js` files. CI needs clean builds.
- [ ] **`tests/setup.ts` forces demo mode globally** (D, S): real-mode tests need a module reset to escape it. Fix before CI runs them on every push.
- [ ] **Explain `deploy.sh` modes** (C, S): `all` hotswaps Lambdas only and skips infra changes like bucket CORS; `infra` is a full CDK deploy.

---

## Release 3 — Looks like a product (~2–3 days)

**Goal:** a writing screen you'd show people: a modern, mobile-first beat player and real artwork. Then invite 5–10 testers.
**Done when:** the design is picked from mockups, every existing player feature still works, it's checked on a real phone, and testers are invited.

Same code: `BeatPlayer.vue` and the images on beats and sessions (Batch E). *(artwork reported 2026-11-14; player redesign requested 2026-11-17)*

What already exists:
- Beats have a `thumbnailUrl` field, and the beat browser list shows it when it's present.
- Sessions have an `artworkUrl` field, and `S3Service.uploadArtwork()` exists, but no UI calls it.

- [ ] **Design pass first** (S): 2–3 phone-sized mockups of the player and session cover art; pick a direction before any code.
- [ ] **Player shows every real beat as "audio"** (S): it derives the name from the last segment of the beat URL, and in production that's always `.../audio.wav?<signature>`. Pass the beat's real name (and creator) into `BeatPlayer` instead. *(found 2026-11-17)*
- [ ] **Redesign the beat player: modern and mobile-first** (L). It currently looks like a first-demo interface. Keep every existing feature:
  - play/pause, -5s / +5s, loop on/off, seek bar with elapsed/total time, volume
  - "✍ Write" button when used in the beat browser (`showWriteButton`)
  - resumes position, volume and loop per session (`initialPosition`, `initialVolume`, `initialLoop`, `update:playbackState`)
  - `beat-audible` event (timing metrics), loading and error states, same-size loading layout
  - New: beat artwork and real beat name/creator. The fixed bottom bar must not hide the lyrics on small screens.
- [ ] **Space to play/pause the beat** (B, S, decide during the design pass): only when focus isn't in a text field or on a control.
- [ ] **Show beat artwork in the player and the session editor** (M): `BeatPlayer` never renders the beat's image. Also confirm whether the live beats actually have `thumbnailUrl` set.
- [ ] **Session artwork** (M): let the user set or change a session's cover at any time, including after creation. Open question: upload a photo, default to the beat's artwork, or both?
- [ ] **Show session artwork in the session list** (S)

---

## Release 4 — Tester feedback, then ready to grow

**Goal:** fix what testers hit first, then make cost and phone load time sensible before sharing widely.
**Re-sort this release after Release 3 feedback.** The items below are the known list, not a commitment.

- [ ] **Whatever testers report** (top of the list by default).
- [ ] **Autosave writes to the server far more than it needs to** (G, M): every save is an S3 `PUT` plus a DynamoDB `UpdateItem`, fired after each 1.5s typing pause and at least every 15s while typing. At ~360 saves per hour of writing that's roughly $0.06–0.11 per active user per month in request fees, which dwarfs versioning storage. Options: a longer server debounce (the local draft already protects every keystroke within 500ms), skip saves when content is unchanged, or skip the DynamoDB update when only the script changed. *(estimated 2026-11-16)*
- [ ] **First load on phones** (M): the main bundle is ~700 KB (224 KB gzipped), mostly the AWS SDK and Quill. Code-split so the session list loads before the editor and SDK. *(from deploy logs, 2026-11-17)*
- [ ] **Fix the remaining `vue-tsc` errors** (D, M): 25 as of 2026-11-17 (`Timeout` types, mock delta typing, beat/session field types, and others).
- [ ] **One API contract** (D, L): generate client types from `fluxury-smithy/` and make the mock return the same shapes as the real API (mock uses `data:` URLs, real uses `s3://`, and that mismatch is how the reopen bug hid). Also removes the `beatId` casts.
- [ ] **Decide on tracking `.env.beta`** (D, S, your call): public-ish IDs, not secrets.
- [ ] **Toolchain warnings** (S): `caniuse-lite` is 20 months old (`npx update-browserslist-db@latest`); CDK warns it's untested on Node 24 (use Node 22 if CDK ever acts oddly).
- [ ] **Delete is lost if the tab closes during the 5-second Undo window** (F, S): the session simply stays (safe side). Could commit on `pagehide` with a keepalive request.
- [ ] **Conflict copies are separate sessions** (F, L): "Use the latest version" saves your text as a new "(my version)" session. A real version-history view would be nicer; S3 versions are already kept 30 days.
- [ ] **Bulk cleanup** (F, M, only if needed): a "Select" mode on the list rather than per-card delete buttons.

---

## Release 5 — Write by voice (Batch H) *(requested 2026-11-17)*

**Goal:** dictate bars straight into the editor with a better, free, open-source speech-to-text than the phone's built-in one.
**Done when:** one tap dictates at the cursor on a phone, accurately enough on rap delivery to beat the built-in keyboard dictation.

- [ ] **Research and pick an engine** (unverified candidates: OpenAI Whisper run in the browser via WebGPU/WASM, whisper.cpp, Vosk, Moonshine). Criteria: accuracy on rap (slang, fast delivery, over a beat), runs on-device so it's free and private, model size and load time on phones, latency.
- [ ] **Where it runs**: on-device (no server cost, no audio leaves the phone) vs. a server (better accuracy, costs money per minute). Free points to on-device.
- [ ] **UX**: one tap to dictate into the editor at the cursor; how it behaves while the beat is playing (the mic will hear the beat).

---

## Release 6 — AI co-writer (Batch I, the vision) *(requested 2026-11-17)*

**Goal:** AI that helps write bars, without taking the writing away from the writer.
**Depends on:** stable saving/editing (Releases 1–4), and probably voice (Release 5).

- [ ] **Suggest the next bars while writing** (inline, accept/dismiss).
- [ ] **Select lines → "Generate more bars"** from the selection.
- [ ] **Backend**: model choice (e.g. via Amazon Bedrock), per-user cost limits, auth on the endpoint, latency targets. Lyrics are the user's: decide what is sent and stored.

---

## Done

**Writing experience**
- [x] **Session titles couldn't contain spaces** (2026-11-17): a page-wide key listener blocked Space outside the lyrics editor, which also broke Space on focused buttons. Removed. (`3886d34`). Deployed 2026-11-17.
- [x] **Flash of empty UI on open** (2026-11-17): it showed an empty editor + "No beat selected" while the whole beat list downloaded, then "Loading session...", then the session. Now an editor-shaped skeleton from the first frame, session and beats load in parallel, the player area has a same-size placeholder until the beat is known, and "No beat selected" only shows when true. The player keeps its full size while audio loads. (`79951dd`, `699d5aa`). Deployed 2026-11-17; beta test passes live.
- [x] **"Sign in to edit" shown to signed-in writers during a save conflict** (`ecf4c80`; regression from `d1f4db3`)
- [x] **Cursor jumps to the start after the first keystroke, and the Quill `offset` error spam**: one root cause. Quill was stored in `ref()`, a deep Vue Proxy that breaks Quill's selection code, so `getSelection()` threw and the cursor reset to 0 (`test` became `est…t`). Fixed with `shallowRef`; the beta test now also fails on any uncaught page error. Found by the beta test on 2026-11-16. (`6b79595`, verified live 2026-11-16)
- [x] "New Session" opens a "Pick a beat" view with a **Write without a beat** option, and a failed load no longer reuses the previous session (`4d12835`)

**Deleting sessions**
- [x] **Delete a session** (2026-11-17): from the editor's **⋯** menu → Delete session. Back on the list the session disappears with a 5-second **Undo**; the delete runs after that, or immediately when leaving the list. No per-card delete button (a rare destructive action shouldn't sit on every card). (`07feb6b`, `6572d02`, `520b115`, `60c5b8c`). Deployed and verified live 2026-11-17: the Lambda left an S3 delete marker on the deleted session's script.json.
- [x] **Deleting a session leaves its lyrics file in S3**: the Lambda now deletes everything under `sessions/<id>/` after the ownership-checked DynamoDB delete; deleted files stay recoverable 30 days via versioning. The store also clears the session's local draft. (`3084cec`, `215fda6`)
- [x] **Undo or soft delete?** Undo window chosen (above). Server-side recovery is S3 versioning + DynamoDB PITR.

**Never lose lyrics**
- [x] **Conflict detection between open copies** (2026-11-16): saves are conditional on the script version each copy loaded (S3 `If-Match` / `If-None-Match`). A refused save pauses saving and offers **Keep my version** or **Use the latest version** (yours is kept as a "(my version)" session). (`9135b19`, `d1f4db3`, beta test `334f5a1`). Deployed and verified live 2026-11-17.
- [x] **Autosave was stuck after any save error**: Retry did nothing and later edits never saved. Saves now retry from `error`. (`611f051`)
- [x] **Stale local draft overrode newer work from other tabs, windows or devices** (2026-11-16): the server copy had no timestamp, so any old draft won. Saves now store `{ delta, editTimestamp }`, drafts are marked synced after a matching save, and `services/resume.ts` decides (unsynced edits newer than the server win, nothing else). Legacy drafts count as synced. (`0f5ba3a`, `1fdd1a3`)
- [x] **Local drafts were never saved to IndexedDB**: `DataCloneError` on the Vue proxy, only logged, so the 500ms local safety net never worked in a real browser. (`09b9442`)
- [x] **Data protection**: DynamoDB point-in-time recovery on both tables (`6e7e06a`) and S3 versioning with 30-day old-version expiry (`5df793e`). Deployed and smoke check passed 2026-11-16.
- [x] Lyrics save on the live site: S3 bucket CORS now allows `PUT` from the app's origins. Verified live on 2026-11-14, desktop save→reopen (`d25248c`)
- [x] Reopened sessions now load S3-backed lyrics, and failed saves show "error" instead of "saved" (`d5e09b7`)

**Tests and checks**
- [x] **Beta test (Playwright) against the deployed beta**: `tests/beta/save-reload.spec.ts`, run with `npm run test:beta`. It types real keys, waits for "Saved", then reopens in a fresh browser with no local draft and checks the lyrics. Test account: Cognito user `beta` (created 2026-11-16). Cleans up after itself: deletes its own session (even on failure) and sweeps leftover "Untitled Session"s in the test account. Add `FLUXURY_BETA_LOCAL=1` to test local code against the beta backend before deploying.
- [x] **Live smoke check `scripts/verify-deployment.sh`**: preflights S3 `PUT`/`GET` from every app origin, checks API CORS and that the frontend loads. Read-only, no login. Runs automatically at the end of `./deploy.sh`. First full run passed all 11 checks (2026-11-14).
- [x] **CDK assertion test**: bucket CORS allows `GET` + `PUT` from every app origin (`fluxury-infra/test/beta-stack.cors.test.ts`). Run with `cd fluxury-infra && npm test`.
- [x] **Unit tests broke when `.env.local` pointed at beta**: all 155 tried to hit the network. Vitest now pins `VITE_DEMO_MODE=true` (2026-11-16)
- [x] Real-mode save→reopen integration test (`d5e09b7`)
