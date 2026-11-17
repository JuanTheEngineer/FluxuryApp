# Fluxury Priority Queue

Ordered by priority. Items in the same batch share code or a theme, so do them together.
Kiro keeps this file up to date as new issues come up in chat.

---

## P0 — Now

_Nothing blocking. New Session fix shipped (`4d12835`)._

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
- [~] **Beta test (Playwright) against the deployed beta**: `tests/beta/save-reload.spec.ts`, run with `npm run test:beta`. It types real keys, waits for "Saved", then reopens in a fresh browser with no local draft and checks the lyrics. **Written, not yet run:** needs a dedicated test account (`FLUXURY_BETA_TEST_USERNAME` / `FLUXURY_BETA_TEST_PASSWORD`). Each run leaves one "Untitled Session" in that account.
- [ ] **Data protection**: S3 versioning plus DynamoDB point-in-time recovery

## P1 — Batch B: Session open experience (`SessionEditorView.vue` load/mount)

Same code path: what happens between opening a session and the editor being ready.

- [ ] **Flash of empty UI on open**: a session briefly shows no lyrics and no beat before the real content arrives. Needs a proper loading treatment so the user never sees "empty" before the data comes back. Design is still open. *(reported 2026-11-14)*
- [ ] **Quill `Cannot read properties of null (reading 'offset')` spam**: `getPlaybackState` calls `quill.getSelection()` while the editor is in a bad state. It repeats dozens of times in the console.
- [ ] **Investigate a `cognito-idp` 400 on page load**: it appears in the console on open. Find out whether it's a harmless token-refresh miss or a real auth bug.

---

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

## P3 — Later / unverified

- [ ] **Beat seeding**: confirm all 5 beats exist in the live backend
- [x] Run `scripts/verify-deployment.sh` end to end. The script didn't exist, so it was created; all 11 checks pass live (2026-11-14)

---

## Done

- [x] "New Session" opens a "Pick a beat" view with a **Write without a beat** option, and a failed load no longer reuses the previous session (`4d12835`)
- [x] Lyrics save on the live site: S3 bucket CORS now allows `PUT` from the app's origins. Verified live on 2026-11-14, desktop save→reopen (`d25248c`)
- [x] Reopened sessions now load S3-backed lyrics, and failed saves show "error" instead of "saved" (`d5e09b7`)
- [x] Real-mode save→reopen integration test (`d5e09b7`)
