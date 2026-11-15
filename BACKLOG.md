# Fluxury Priority Queue

Ordered by priority. Items in the same batch share code or a theme, so do them together.
Kiro keeps this file up to date as new issues come up in chat.

---

## P0 — Now

_Nothing blocking. Pick the next batch below._

---

## P1 — Batch A: "Never lose lyrics" guardrails

These stop the save bug from coming back without anyone noticing.

- [ ] **CDK assertion test**: bucket CORS allows `PUT` from every app origin (`fluxury-infra/test`, Jest). This would have caught the P0 bug.
- [ ] **Preflight check in `scripts/verify-deployment.sh`**: `curl -X OPTIONS` to the bucket with `Origin: https://www.fluxury.app`, fail if no allow header
- [ ] **Playwright e2e test against a deployed env**: log in, type, see "saved", reload in a fresh context, lyrics are there (`tests/e2e/smoke.spec.ts`)
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
- [ ] **Stop committing build output**: `fluxury-infra/lib/*.js` next to the `.ts` files, `cdk.out`, `cookies.txt`
- [ ] **Decide on tracking `.env.beta`** (public-ish IDs, not secrets)
- [ ] **`tests/setup.ts` forces demo mode globally**: real-mode tests need a module reset to escape it

## P3 — Later / unverified

- [ ] **Beat seeding**: confirm all 5 beats exist in the live backend
- [ ] **Run `scripts/verify-deployment.sh` end to end** at least once

---

## Done

- [x] Lyrics save on the live site: S3 bucket CORS now allows `PUT` from the app's origins. Verified live on 2026-11-14, desktop save→reopen (`d25248c`)
- [x] Reopened sessions now load S3-backed lyrics, and failed saves show "error" instead of "saved" (`d5e09b7`)
- [x] Real-mode save→reopen integration test (`d5e09b7`)
