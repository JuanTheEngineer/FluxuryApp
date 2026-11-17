# Fluxury Priority Queue

Ordered by priority. Items in the same batch share code or a theme, so do them together.
Kiro keeps this file up to date as new issues come up in chat.

---

## P0 — Now

Silent data loss for anyone who uses more than one device (e.g. phone + laptop).

- [ ] **Stale local draft overwrites newer work from another device (data loss)** *(found 2026-11-16)*: on open, `SessionEditorView` uses the local draft if `draft.editTimestamp > serverTimestamp`, but the server file never contains an `editTimestamp` (`saveScript` uploads the raw delta), so `serverTimestamp` is always 0. Local drafts are also never cleared after a successful save. Result: any device that ever edited a session shows ITS OWN old draft, and the next keystroke autosaves it over newer work from another device.
  - **Step 1 (fix):** save `{ delta, editTimestamp }`; mark the local draft synced after a successful server save; on open, use the draft only if it has unsynced edits. Add a test: save on device A, save newer on device B, reopen on A → B's version.
  - **Step 2 (conflict detection):** save with S3 conditional writes (`If-Match` on the ETag loaded at open, already exposed via CORS). On `412`, show "This session changed on another device", with Keep mine / Keep theirs / Keep both. No client clocks involved.

---

## P1 — Batch E: Artwork (beats + sessions)

Same feature area: images on beats and sessions. **Needs a design pass before building.** *(reported 2026-11-14)*

What already exists:
- Beats have a `thumbnailUrl` field, and the beat browser list shows it when it's present.
- Sessions have an `artworkUrl` field, and `S3Service.uploadArtwork()` exists, but no UI calls it.

- [ ] **Show beat artwork in the player and the session editor**: `BeatPlayer` never renders the beat's image. Also confirm whether the live beats actually have `thumbnailUrl` set.
- [ ] **Session artwork**: let the user set or change a session's cover at any time, including after creation. Open question: upload a photo, default to the beat's artwork, or both?
- [ ] **Show session artwork in the session list**

---

## P1 — Batch A: "Never lose lyrics" guardrails

These stop the save bug from coming back without anyone noticing.

- [x] **CDK assertion test**: bucket CORS allows `GET` + `PUT` from every app origin (`fluxury-infra/test/beta-stack.cors.test.ts`). Run with `cd fluxury-infra && npm test`.
- [x] **Live smoke check `scripts/verify-deployment.sh`**: preflights S3 `PUT`/`GET` from every app origin, checks API CORS and that the frontend loads. Read-only, no login. Runs automatically at the end of `./deploy.sh`.
- [x] **Beta test (Playwright) against the deployed beta**: `tests/beta/save-reload.spec.ts`, run with `npm run test:beta`. It types real keys, waits for "Saved", then reopens in a fresh browser with no local draft and checks the lyrics. Test account: Cognito user `beta` (created 2026-11-16). Cleans up after itself: deletes its own session (even on failure) and sweeps leftover "Untitled Session"s in the test account. Add `FLUXURY_BETA_LOCAL=1` to test local code against the beta backend before deploying.
- [x] **Data protection**: DynamoDB point-in-time recovery on both tables (`6e7e06a`) and S3 versioning with 30-day old-version expiry (`5df793e`). Deployed and smoke check passed 2026-11-16.
- [ ] **Stack deletion still wipes all data**: tables and bucket use `RemovalPolicy.DESTROY`, and the bucket has `autoDeleteObjects`, so `cdk destroy` or a stack replacement deletes every session and lyrics file. PITR and versioning don't survive that. Switch to `RETAIN` for the data resources; removing `autoDeleteObjects` safely needs a careful CDK check first.
- [ ] **Write a restore runbook**: how to restore an old `script.json` version, and how to do a PITR restore of the sessions table. A backup nobody knows how to restore doesn't help much.

## P1 — Batch F: Delete a session

Same feature end to end: the button, the API call, and cleaning up storage.

- [ ] **Delete a session from the UI** *(requested 2026-11-16)*: there's no way to delete a session today. `sessionStore.deleteSession()` and the API `DELETE /sessions/{id}` already exist; only the UI is missing. Reuse the beat browser's inline "Delete? Yes / No" confirm so it matches the existing pattern and prevents accidental taps. Decide where it lives: the session card, the editor, or both.
- [ ] **Deleting a session leaves its lyrics file in S3**: the `sessions` Lambda deletes only the DynamoDB item, so `sessions/<id>/script.json` is orphaned. Delete the S3 object in the Lambda as part of the same delete. Found while adding test cleanup on 2026-11-16.
- [ ] **Undo or soft delete?** Lyrics are the one thing users can't recreate. Consider an "Undo" toast for a few seconds before the delete commits, rather than a hard delete on confirm.

## P1 — Batch B: Session open experience (`SessionEditorView.vue` load/mount)

Same code path: what happens between opening a session and the editor being ready.

- [ ] **Flash of empty UI on open**: a session briefly shows no lyrics and no beat before the real content arrives. Needs a proper loading treatment so the user never sees "empty" before the data comes back. Design is still open. *(reported 2026-11-14)*
- [x] **Cursor jumps to the start after the first keystroke, and the Quill `offset` error spam**: one root cause. Quill was stored in `ref()`, a deep Vue Proxy that breaks Quill's selection code, so `getSelection()` threw and the cursor reset to 0 (`test` became `est…t`). Fixed with `shallowRef`; the beta test now also fails on any uncaught page error. Found by the beta test on 2026-11-16. (`6b79595`, verified live 2026-11-16)
- [ ] **Investigate a `cognito-idp` 400 on page load**: it appears in the console on open. Find out whether it's a harmless token-refresh miss or a real auth bug.

---

## P2 — Batch G: Autosave cost at scale

- [ ] **Autosave writes to the server far more than it needs to**: every save is an S3 `PUT` plus a DynamoDB `UpdateItem`, fired after each 1.5s typing pause and at least every 15s while typing. At ~360 saves per hour of writing that's roughly $0.06–0.11 per active user per month in request fees, which dwarfs versioning storage. Options: a longer server debounce (the local draft already protects every keystroke within 500ms), skip saves when content is unchanged, or skip the DynamoDB update when only the script changed. Worth doing before real user growth, not now. *(estimated 2026-11-16)*

## P2 — Batch C: Environments and CI

Stop testing on the only environment, which users also use.

- [ ] **Separate `dev` stack**: parameterize the CDK stack name and origins, deploy `FluxuryDev` next to `FluxuryBeta`
- [ ] **GitHub Actions CI**: typecheck, unit tests, CDK synth and assertion tests, then deploy to dev and run e2e
- [ ] **Deploy guard**: `deploy.sh` refuses to run from a dirty or unpushed tree (local, git and live drifted before)
- [ ] **Explain `deploy.sh` modes**: `all` hotswaps Lambdas only and skips infra changes like bucket CORS; `infra` is a full CDK deploy

## P2 — Batch D: Repo hygiene and one contract

- [ ] **Fix the 28 existing `vue-tsc` errors** (`beatId`, `Timeout` types, mock delta typing, and others)
- [ ] **One API contract**: generate client types from `fluxury-smithy/` and make the mock return the same shapes as the real API (mock uses `data:` URLs, real uses `s3://`, and that mismatch is how the reopen bug hid)
- [ ] **Stop committing build output**: `fluxury-infra/lib/*.js` next to the `.ts` files, `cdk.out`, `cookies.txt`. The stale `lib/beta-stack.js` made Jest test old code on 2026-11-14 (worked around via `moduleFileExtensions`). Delete the stale `.js` files.
- [ ] **Decide on tracking `.env.beta`** (public-ish IDs, not secrets)
- [ ] **`tests/setup.ts` forces demo mode globally**: real-mode tests need a module reset to escape it
- [x] **Unit tests broke when `.env.local` pointed at beta**: all 155 tried to hit the network. Vitest now pins `VITE_DEMO_MODE=true` (2026-11-16)

## P3 — Later / unverified

- [ ] **Beat seeding**: confirm all 5 beats exist in the live backend
- [x] Run `scripts/verify-deployment.sh` end to end. The script didn't exist, so it was created; all 11 checks pass live (2026-11-14)

---

## Done

- [x] "New Session" opens a "Pick a beat" view with a **Write without a beat** option, and a failed load no longer reuses the previous session (`4d12835`)
- [x] Lyrics save on the live site: S3 bucket CORS now allows `PUT` from the app's origins. Verified live on 2026-11-14, desktop save→reopen (`d25248c`)
- [x] Reopened sessions now load S3-backed lyrics, and failed saves show "error" instead of "saved" (`d5e09b7`)
- [x] Real-mode save→reopen integration test (`d5e09b7`)
