# Fluxury Release Plan

Organized by release. Each release has a goal and an exit criterion; within a release, items are listed in the order to do them. Batch letters (A–I) are kept so older commits and notes still line up.
Kiro keeps this file up to date as new issues come up in chat.

**Blocking right now:** nothing. **Release 1 shipped as v0.1.0-beta on 2026-11-18.** Next up: Release 2 (dev stack + CI).

**Why this order:** first make the beta safe to hand to someone else, then stop testing on the environment users use, then make it look like a product and invite testers, then let their feedback decide what's next. Voice and AI come once the core is stable.

---

## Release 1 — Trustworthy beta (now, ~1 day)

**Goal:** safe to invite the first people who aren't you. Nothing we do can destroy a writer's lyrics, sign-in is clean, and a new user lands on working beats.
**Done when:** every item below is checked, the beta test passes live, and you'd send the link to a friend.

- [x] **Stack deletion no longer wipes user data** (A, M): sessions table, beats table, files bucket and the Cognito user pool are now `RETAIN`, and `autoDeleteObjects` is off for the files bucket (CDK 2.143.0's handler skips untagged buckets; the tag is removed before the custom resource is deleted, checked in the handler code and `cdk diff`). Frontend bucket stays `DESTROY` (rebuilt from git). (`fb86340`). Deployed 2026-11-17 after a local bucket backup (`~/fluxury-backups/files-2026-11-17`, 28 files); verified live: all 28 files and 46 versions intact, auto-delete tag and resource gone, CloudFormation shows `Retain` on all four, beta test passes. Side effect for the runbook: after a `cdk destroy`, the retained resources keep their fixed names, so a redeploy must import them instead of creating new ones.
- [x] **Write a restore runbook** (A, S): `RESTORE_RUNBOOK.md` covers overwritten lyrics, a deleted session, a damaged table, a destroyed stack and user accounts, with a drill log. Read-only commands run verbatim against the live beta, including recovering a deleted session's lyrics from S3 history. (`7a4243d`)
- [x] **Run the record drill once** (A, S): PITR restore into a temporary table, live 3 / restored 3, temporary table deleted (2026-11-17). Logged in `RESTORE_RUNBOOK.md`.
- [x] **Deletion protection on the user pool and both tables** (A, S): on for the Cognito user pool and both DynamoDB tables (blocks deletes from the console/CLI, not just CloudFormation); test in `beta-stack.retention.test.ts`; `cdk diff` shows in-place property changes only. (`ce8f93f`). Deployed 2026-11-17; verified live: pool `ACTIVE`, both tables `true`, data unchanged (2 users, 3 sessions, 6 beats).
- [x] **Investigate a `cognito-idp` 400 on page load** (B, S): **benign, explained** (2026-11-17). Reproduced live in a real browser: when the saved login has expired, Amplify refreshes it with `GetTokensFromRefreshToken`; if the refresh token is no longer valid (older than 7 days, revoked by a sign-out elsewhere, or a password reset), Cognito answers `400 NotAuthorizedException: Invalid Refresh Token`. The app then clears the saved login and shows sign-in; the next reload makes no further call. A fresh sign-in, reloads, and an expired token with a valid refresh token all return 200. Your 400 on 2026-11-14 fits a login more than 7 days old (the console log was preserved across the redirect to sign-in and your new sign-in). Rotation is off, so it isn't a refresh race.
- [x] **Stay signed in for 14 days instead of 7** (B, S): `refreshTokenValidity` 7 → 14 days (chosen 2026-11-17 over Cognito's 30-day default). In-place update of the user pool client, same client id; applies to sign-ins after deploy. Test: `beta-stack.auth.test.ts`. (`2989bb4`). Deployed 2026-11-18; verified live: same client id, `RefreshTokenValidity` 20160 minutes; beta test passes.
- [x] **Beat seeding** (S): checked 2026-11-18 (read-only). 6 beat records, and every one's audio file exists in S3; the API returns all 6 with working signed URLs; Chrome loads and plays them (first beat 0.4 s). **But only 1 of 6 is actually a WAV** (see next item).
- [x] **Session deleted while open elsewhere** (F, S): a failed save (S3 404, or API 403) now checks whether the session still exists; if not, saving pauses and the editor says "This session was deleted in another tab or on another device" with **Save as a new session** (`<name> (restored)`, same beat, current lyrics). Verified against the beta backend: real S3 answered 404. Also fixed: going from one session to another now loads the new one (`db6ae96`). (`843bef4`). Deployed 2026-11-18 (first deploy through the guard); beta test passes live.
- [x] **Tell people why they were signed out, and return them to where they were** (B, S): a device marker tells "expired" from "never signed in"; the sign-in page says "Your session expired. Sign in again to keep writing." and returns you to the page you were on (same-site paths only). Verified against the beta backend with a rejected refresh token. (`718216f`). Deployed 2026-11-18.
- [x] **Deploy guard** (C, S): `scripts/deploy-guard.sh` runs first in `deploy.sh`: on `main`, clean tree, no untracked files in deployed folders, no `.env.beta.local`, and HEAD = origin/main. Override for emergencies: `FLUXURY_DEPLOY_UNSAFE=1`. Tests: `scripts/test-deploy-guard.sh` (10/10). (`d132438`)
- [x] **Orphaned files in S3** (F, S): deleted 2026-11-18 after review: 18 lyrics files left by beta test runs on Nov 17 (`test bar …`, 1,187 bytes) and `beats/beat-dQw4w9WgXcQ/audio.wav` (39 MB Rick Astley download test from June, no beat record). Recoverable for 30 days via versioning. 0 orphans left; 3 live sessions and 6 beats untouched.
- [x] **New testers can't create an account** (B, S): decided 2026-11-18: **admin-only accounts for the beta.** The sign-in page no longer offers a sign-up that can't work and says the beta is invite-only (`2ff75b6`). Create accounts with `./scripts/create-tester.sh <username> <email>` (prints a password to send privately; `356de9b`).
- [x] **Release v0.1.0-beta** (S): shipped 2026-11-18. Tag `v0.1.0-beta` on `f3ca18e` (deployed through the guard), `RELEASE_NOTES.md`. Verified live: sign-in page is invite-only, smoke check and beta test pass. **Release 1 complete.** Next: invite testers with `scripts/create-tester.sh`.

---

## Release 1.1 — Writing flow fixes from testing (small, ship before Release 2)

- [ ] **Turn autocorrect off in the lyrics editor, keep suggestions** (S) *(requested 2026-11-18)*: autocorrect breaks the writing flow, and rap spelling is often deliberately "wrong". Set `autocorrect="off"` on the Quill editor (`quill.root`). Open question, test on a real iPhone and Android before deciding: whether `spellcheck="false"` (no red underlines) also hides the keyboard's suggestion bar, which should stay. Also decide `autocapitalize` (sentence capitals at the start of each line, or off).

---

## Release 2 — Ship safely (~1 day, enabler)

**Goal:** stop testing on the only environment, which users also use, before the biggest UI change in Release 3.
**Done when:** every push runs CI, and changes reach fluxury.app only after passing on a dev stack.

In order (each step makes the next one possible):

- [x] **Stop committing build output** (D, S): untracked `fluxury-app/test-results/.last-run.json` (`e5c3c3f`).
- [x] **Stale compiled files in infra** (D, S): they were gitignored, not committed, but stale on disk since June and once tested by Jest. Deleted them, and `tsconfig.json` now sets `noEmit` so `tsc` only type-checks (`1a954f2`). Jest 27/27, `cdk diff` vs live: no differences.
- [ ] **YouTube metadata Lambda imports an undeclared package** (D, S): `lib/lambdas/youtube-metadata.ts` imports `@aws-sdk/client-lambda`, which isn't in `package.json` (the infra's only `tsc` error). Probably works in Lambda (Node 18 ships SDK v3, and CDK leaves `@aws-sdk/*` out of the bundle), but declare it. Check with the "Adding beats from YouTube" test. *(found 2026-11-18)*
- [ ] **GitHub Actions CI** (C, M): **step 1, no AWS access needed:** on every push run the frontend tests, infra tests, script tests and CDK synth; the typecheck may not exceed the current error count (25). **Step 2, after the dev stack:** deploy to dev and run the beta test there (needs an AWS role for GitHub: your OK).
- [ ] **Separate `dev` stack** (C, L): parameterize the CDK stack name and origins, deploy `FluxuryDev` next to `FluxuryBeta`.
- [ ] **Make the post-`cdk destroy` recovery real** (A, M): add a switch to synthesize only the four retained data resources (for `cdk import`), then rehearse `RESTORE_RUNBOOK.md` section 4 end to end on the dev stack. Today that section is untested.
- [ ] **`tests/setup.ts` forces demo mode globally** (D, S): real-mode tests need a module reset to escape it. Fix before CI runs them on every push.
- [ ] **Explain `deploy.sh` modes** (C, S): `all` hotswaps Lambdas only and skips infra changes like bucket CORS; `infra` is a full CDK deploy.

---

## Release 3 — Looks like a product (~2–3 days)

**Goal:** a writing screen you'd show people: a modern, mobile-first beat player, bars linked to lyrics, and real artwork. Then invite 5–10 testers.
**Done when:** the design is picked from mockups, every existing player feature still works, it's checked on a real phone, and testers are invited.

Same code: `BeatPlayer.vue` and the images on beats and sessions (Batch E). *(artwork reported 2026-11-14; player redesign requested 2026-11-17)*

What already exists:
- Beats have a `thumbnailUrl` field, and the beat browser list shows it when it's present.
- Sessions have an `artworkUrl` field, and `S3Service.uploadArtwork()` exists, but no UI calls it.

- [ ] **Design pass first** (S): 2–3 phone-sized mockups of the player, bars (below) and session cover art; pick a direction before any code. Bars change what the player shows (bar counter, beat dots, sections), so design them together.

### Bars: every lyric line linked to a bar of the beat (Batch J, **the USP**) *(requested 2026-11-18)*

A rap verse is counted in bars (4 beats each, 16 bars a verse, 8 a hook), and most rappers write one bar per line. Fluxury knows the beat, so it can show where each line falls and follow along as it plays.

- [ ] **Spike: can we find the bars in a beat automatically?** (M, do first, go/no-go): run open-source beat and downbeat trackers (unverified candidates: madmom, Beat This!, Essentia/essentia.js, librosa for tempo) on the 6 beats; check by ear and on a timeline whether bar 1 and the tempo come out right. Expected trouble: intros without drums, half-time feel, swing.
- [ ] **Store a bar grid per beat** (M): tempo, time of the first downbeat, and the list of downbeat times (handles tempo drift). Computed once when a beat is added; manual correction ("tap to set bar 1", nudge, tap tempo), because detection will sometimes be wrong.
- [ ] **Bar numbers beside the lyrics** (M): line N = bar N by default, starting at a chosen bar (e.g. after a 4-bar intro). Works on a blank session: numbered empty bar slots you fill in, like a lined notebook. Inserting a line pushes the following bars down.
- [ ] **Follow the beat while it plays** (M): highlight the current bar's line (or empty slot) and show 4 beat dots for where you are inside the bar. Works with no lyrics, partial lyrics and full lyrics. Must not move the cursor or yank the scroll while you type.
- [ ] **Loop a section** (S): loop bars 9–16 to write a hook over it. Builds on the existing loop.
- [ ] **Later: exceptions and tools** (L): pickups (a line starting before its bar), two lines per bar, instrumental gaps, section labels (Intro/Verse/Hook), syllables per bar, and AI "write bar 12" (Release 6).
- Open questions for Juan: one bar per line, or sometimes two? Empty bars as visible numbered lines, or only in the margin? While playing, should the view follow the beat or stay where you're typing? Sessions without a beat: no bars, or a metronome at a chosen tempo?
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
- [ ] **Make every beat play on every phone** (M, **needs your OK**: production writes). **Lower risk than first thought:** a WebM beat plays on Juan's iPhone (checked 2026-11-18), so this mainly protects older iPhones and cuts the 58 MB beat to ~7 MB. 5 of the 6 beats are WebM/Opus files (YouTube's format) saved as `audio.wav` with content type `audio/wav`; they came from `seed-beats.sh` uploading local files in `fluxury-server/beats/` that are WebM despite the `.wav` name. Chrome sniffs the real format and plays them; **iPhone Safari support for WebM/Opus is uncertain** (sources disagree; at best iOS 17.4+, older iPhones can't). The 6th is a real WAV but 58 MB for 5 min, heavy on mobile data. Fix: convert all six to **AAC in `.m4a`** (plays on every iPhone, Android and desktop; ~5–7 MB each), upload as `beats/<id>/audio.m4a` with `audio/mp4`, point each record's `s3Key` at it. Keep the old files (versioned; no deletes). Verify on a real iPhone.
- [ ] **New beats must be stored as AAC `.m4a`** (S): `fluxury-server/server.js` runs `yt-dlp --audio-format wav` (huge files); the YouTube-download Lambda stores WebM/Opus; `seed-beats.sh` labels whatever it uploads `audio/wav`. Use `yt-dlp -f "bestaudio[ext=m4a]"` (YouTube's native AAC, no re-encoding), set `audio/mp4`, and make the seed script set the type from the real file.
- [ ] **Fix the remaining `vue-tsc` errors** (D, M): 25 as of 2026-11-17 (`Timeout` types, mock delta typing, beat/session field types, and others).
- [ ] **One API contract** (D, L): generate client types from `fluxury-smithy/` and make the mock return the same shapes as the real API (mock uses `data:` URLs, real uses `s3://`, and that mismatch is how the reopen bug hid). Also removes the `beatId` casts.
- [ ] **Decide on tracking `.env.beta`** (D, S, your call): public-ish IDs, not secrets.
- [ ] **Toolchain warnings** (S): `caniuse-lite` is 20 months old (`npx update-browserslist-db@latest`); CDK warns it's untested on Node 24 (use Node 22 if CDK ever acts oddly).
- [ ] **Self sign-up** (B, M, later, when ready to open the beta): enable `selfSignUpEnabled`, a real sign-up form with the emailed code, and abuse limits (Cognito's default email sender allows about 50 emails a day; use SES beyond that).
- [ ] **Change or reset your password in the app** (B, S, **build before inviting more than ~5 testers**): today only an admin can (`aws cognito-idp admin-set-user-password ... --permanent`). Change password while signed in, plus "Forgot password" by emailed code (testers' emails are already verified by `create-tester.sh`). Decided 2026-11-18: invite the first testers now, build this later.
- [ ] **Logout leaves you on the page** (B, S): the header's Logout signs you out but stays on the current (protected) page until you navigate. Send to `/login` after signing out. *(found 2026-11-18)*
- [ ] **A never-saved session deleted elsewhere can leave one orphan `script.json`** (F, S): its first save uses `If-None-Match`, which S3 allows over a delete marker, before the API reports the record is gone. A few bytes; delete the file when the API returns 403, or include it in the orphan cleanup. *(found 2026-11-18)*
- [ ] **Old `SessionStack` from April 2025** (S, **needs your OK**: permanent delete; decide with the production plan): a whole earlier prototype, not just a table. Contains its own API (`v54qeb9ih8`, "Fluxury Session API", no calls in 90 days), user pool `us-east-1_fwsCeebLa` (**1 user**, created 2025-04-13), bucket `fluxury-session-files` (empty, auto-delete on), an empty table, 6 Lambdas. The live app doesn't use it, but `fluxury-app/src/auth.ts` falls back to its pool ids, and `lib/session-stack.ts` still defines it. The `auth.ts` fallbacks are removed (`54e09b2`; they were never in the shipped bundle). The stack is still defined in `bin/fluxury-infra.ts` and `bin/fluxury-infra-prod.ts`, so deleting it belongs with the production plan. Deleting it removes the 1 user permanently. *(checked 2026-11-18)*
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
