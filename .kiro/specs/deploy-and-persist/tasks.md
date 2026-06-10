# Implementation Plan: Deploy and Persist

## Overview

Deploy the FluxuryApp AWS backend, wire the Vue frontend to real persistence services, and host the app at a publicly accessible HTTPS URL. This transforms the prototype into a single-user production system with real DynamoDB sessions, S3 file storage, and Cognito authentication.

Implementation sequence: CDK stack fixes → deploy script enhancement → frontend wiring → infrastructure deployment → user creation → beat seeding → frontend build/deploy → verification.

## Tasks

- [x] 1. Fix CDK Stack for Production Readiness
  - [x] 1.1 Disable self-signup and configure refresh token validity
    - In `fluxury-infra/lib/beta-stack.ts`, change `selfSignUpEnabled: true` to `selfSignUpEnabled: false`
    - Add `refreshTokenValidity: Duration.days(7)` to the `UserPoolClient` configuration
    - _Requirements: 2.1, 2.7_

  - [x] 1.2 Add Cognito Identity Pool with S3 access
    - Add `CfnIdentityPool` linked to the User Pool and User Pool Client
    - Add `CfnIdentityPoolRoleAttachment` with an authenticated IAM role
    - The authenticated role must grant `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on the Files Bucket ARN
    - Add `CfnOutput` for `IdentityPoolId`
    - _Requirements: 5.5, 5.4_

  - [x] 1.3 Make bucket lifecycle conditional and add S3 CORS
    - Replace the hardcoded 30-day lifecycle rule with a conditional check on CDK context variable `bucketExpirationDays` (no rule if not set)
    - Add a CORS configuration to the Files Bucket allowing GET from the `allowedOrigin` context variable (default `https://juantheengineer.com`) and `http://localhost:5173`
    - _Requirements: 1.7, 1.8, 9.5_

  - [x] 1.4 Parameterize CORS origin via context variable
    - Read `allowedOrigin` from `this.node.tryGetContext('allowedOrigin')` with default `'https://juantheengineer.com'`
    - Use this variable in API Gateway `allowOrigins` and Lambda environment `CORS_ORIGIN`
    - _Requirements: 9.1, 9.6_

  - [x] 1.5 Add CloudFront + S3 static hosting for frontend
    - Create a private S3 bucket for frontend assets with OAI access
    - Create a CloudFront distribution with: default root object `index.html`, custom error responses for SPA routing (403/404 → `/index.html`), cache policies (hashed assets 1 year immutable, `index.html` max 5 min)
    - Add `CfnOutput` for `CloudFrontURL` and `FrontendBucketName`
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [x] 1.6 Update Beats Lambda to query DynamoDB instead of returning hardcoded data
    - Modify `fluxury-infra/lib/lambdas/beats.ts` GET handler to query the Sessions table for items with `type: 'beat'`
    - For each beat, generate a presigned S3 GET URL for the audio file and include it in the response
    - POST handler should store beat metadata in the Sessions table with `type: 'beat'` discriminator and `id` prefix `beat-`
    - _Requirements: 6.3, 5.4_

- [~] 2. Checkpoint - Verify CDK synthesizes cleanly
  - Run `cd fluxury-infra && npx cdk synth FluxuryBeta` and ensure no errors
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Enhance Deploy Script for Full Flow
  - [x] 3.1 Add jq prerequisite check and Identity Pool output parsing
    - Add `command -v jq` check at the top of `deploy-beta-code.sh`
    - After deploy, parse `IdentityPoolId`, `CloudFrontURL`, and `FrontendBucketName` from `cdk-outputs-beta.json`
    - Add `VITE_COGNITO_IDENTITY_POOL_ID` to the generated `.env.beta` file
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 3.2 Add Cognito user creation step
    - After writing `.env.beta`, prompt for `FLUXURY_DEV_EMAIL` and `FLUXURY_DEV_PASSWORD` (or read from env vars)
    - Run `aws cognito-idp admin-create-user` with `--message-action SUPPRESS` and `email_verified=true`
    - Run `aws cognito-idp admin-set-user-password` with `--permanent`
    - Handle `UsernameExistsException` gracefully (skip and log)
    - _Requirements: 2.2_

  - [x] 3.3 Add frontend build, S3 upload, and CloudFront invalidation steps
    - `cd ../fluxury-app && npm run build -- --mode beta`
    - `aws s3 sync dist/ s3://$FRONTEND_BUCKET --delete`
    - Set cache headers: `--cache-control "max-age=31536000,immutable"` for `assets/`, `--cache-control "max-age=300"` for `index.html`
    - `aws cloudfront create-invalidation --distribution-id $CF_DIST_ID --paths "/*"`
    - _Requirements: 7.1, 7.5, 1.3_

- [ ] 4. Wire Frontend to Real AWS Services
  - [x] 4.1 Update `auth.ts` to include Identity Pool ID
    - Add `identityPoolId: import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID` to the Amplify `ResourcesConfig`
    - _Requirements: 5.5_

  - [x] 4.2 Update `s3Service.ts` to use Cognito Identity Pool credentials
    - Import `fetchAuthSession` from `aws-amplify/auth`
    - Before each S3 operation, call `fetchAuthSession()` to get temporary AWS credentials
    - Pass credentials to the `S3Client` instance (or re-create it with fresh credentials per call)
    - _Requirements: 5.1, 5.2, 5.4_

  - [x] 4.3 Add token refresh and 401 redirect to `auth-interceptor.ts`
    - On 401 response, call `fetchAuthSession({ forceRefresh: true })` and retry the request once
    - If retry also fails with 401, emit a warning and trigger redirect to AuthForm (e.g., via event bus or window.location)
    - _Requirements: 3.2, 3.3_

  - [x] 4.4 Add environment variable validation at app startup
    - In the app entry point (or `App.vue` setup), check all required env vars are present when `VITE_DEMO_MODE === 'false'`
    - Throw a descriptive error if any are missing
    - _Requirements: 8.4_

  - [x] 4.5 Update `.env.beta` template with Identity Pool variable
    - Add `VITE_COGNITO_IDENTITY_POOL_ID=` placeholder to `.env.beta`
    - _Requirements: 8.2_

- [~] 5. Checkpoint - Verify frontend builds in beta mode
  - Run `cd fluxury-app && npm run build -- --mode beta` and ensure no TypeScript or build errors
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Create Beat Seed Script
  - [x] 6.1 Write `scripts/seed-beats.sh`
    - Read `API_URL`, `BUCKET_NAME`, and auth token from `cdk-outputs-beta.json` and Cognito auth
    - For each `.wav` in `fluxury-app/public/beats/`: check if beat already exists via `GET /beats`, skip if found
    - Upload `.wav` to S3 at `beats/beat-{slug}/audio.wav`
    - Register metadata via `POST /beats` with `id`, `name`, `fileName`
    - _Requirements: 6.1, 6.2, 6.4_

- [ ] 7. Deploy Infrastructure and Seed Data
  - [~] 7.1 Run the enhanced deploy script
    - Execute `cd fluxury-infra && bash scripts/deploy-beta-code.sh`
    - Verify `cdk-outputs-beta.json` contains all expected outputs (API URL, User Pool ID, Client ID, Bucket, Identity Pool ID, CloudFront URL, Frontend Bucket)
    - **Manual step**: Enter developer email and password when prompted
    - _Requirements: 1.1, 1.2, 1.3_

  - [~] 7.2 Run the seed script
    - Execute `bash scripts/seed-beats.sh`
    - Verify all 5 beats appear in `GET /beats` response
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 8. Build and Deploy Frontend
  - [~] 8.1 Build frontend with beta configuration
    - Run `cd fluxury-app && npm run build -- --mode beta`
    - Verify `dist/` contains hashed assets and `index.html`
    - _Requirements: 7.1, 8.1, 8.3_

  - [~] 8.2 Upload to S3 and invalidate CloudFront
    - Run the S3 sync and CloudFront invalidation (either via deploy script step or manually)
    - Verify CloudFront URL serves `index.html`
    - _Requirements: 7.2, 7.3_

- [ ] 9. End-to-End Verification
  - [~] 9.1 Verify authentication flow
    - Open CloudFront URL in browser, confirm AuthForm appears
    - Log in with developer credentials, confirm navigation to sessions list
    - _Requirements: 10.1, 10.2_

  - [~] 9.2 Verify session persistence
    - Create a new session, write lyrics, wait for autosave
    - Close and reopen the app — confirm session and lyrics are intact
    - _Requirements: 10.3, 10.4_

  - [~] 9.3 Verify beat playback from S3
    - Play a seeded beat, confirm audio streams without error
    - _Requirements: 10.5_

  - [~] 9.4 Write a smoke test script (`scripts/verify-deployment.sh`)
    - Curl API Gateway → expect 403 (auth required)
    - Authenticate via Cognito CLI → get tokens
    - Curl `GET /sessions` with token → expect `{ sessions: [] }` or valid list
    - Curl CloudFront URL → expect HTML containing `<div id="app">`
    - _Requirements: 10.1, 10.2_

- [~] 10. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm deployed URL works from a different device/network.

## Notes

- Tasks in sections 7-9 involve running commands against live AWS infrastructure — they require configured AWS credentials and will incur costs (~$5/month at beta scale)
- The deploy script handles the Cognito user creation interactively — have your email and desired password ready
- If the CloudFront domain (`juantheengineer.com`) conflicts with existing hosting, use the default CloudFront domain (`d123xxx.cloudfront.net`) for beta and CNAME later
- Beat seeding requires an authenticated API call — the seed script needs a valid JWT token (obtained via Cognito CLI auth)
- Property-based testing does not apply to this infrastructure spec
- Each task is designed to be completable in 15-30 minutes for a total afternoon deployment session

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.5", "1.6"] },
    { "id": 2, "tasks": ["3.1", "3.2", "4.1", "4.4", "4.5"] },
    { "id": 3, "tasks": ["3.3", "4.2", "4.3"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1"] },
    { "id": 7, "tasks": ["8.2"] },
    { "id": 8, "tasks": ["9.1", "9.4"] },
    { "id": 9, "tasks": ["9.2", "9.3"] }
  ]
}
```
