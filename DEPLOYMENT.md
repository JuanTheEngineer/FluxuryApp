# Fluxury Deployment Guide

## What This Is

Fluxury is a rap-writing web app. You open it, hear a beat, write lyrics, and everything autosaves. This guide tells you how to go from "running on localhost" to "running on a real URL I can access from my phone."

---

## Current State of the Project

| What | Status |
|------|--------|
| App runs locally in demo mode | ✅ Working |
| Dark theme, mobile-first UI | ✅ Done |
| Sessions list, editor, beat player | ✅ Working |
| Debounced autosave (1.5s) | ✅ Implemented |
| Local draft persistence (IndexedDB) | ✅ Implemented |
| Session resume (cursor, beat state) | ✅ Implemented |
| 153 unit tests + 14 property tests | ✅ Passing |
| 3 Playwright E2E tests | ✅ Passing |
| CDK infrastructure code | ✅ Ready to deploy |
| Deploy script | ✅ Written |
| Real AWS deployment | ❌ Not yet run |

---

## Architecture Overview

```
Your Phone / Browser
        │
        ▼
CloudFront (HTTPS, caches frontend)
        │
        ├── Static files → S3 (Frontend Bucket)
        │
        └── API calls → API Gateway → Lambda → DynamoDB + S3
                              │
                              └── Auth: Cognito User Pool (JWT)
```

**Cost at single-user scale: ~$5/month** (pay-per-request everything)

---

## Prerequisites

Before deploying, you need:

1. **AWS CLI configured** — `aws configure` with your access key, secret, and region (`us-east-1`)
2. **Node.js 18+** — for CDK and building the frontend
3. **jq** — for parsing JSON outputs (`brew install jq`)
4. **AWS CDK** — installed globally or the script will install it for you

Verify with:
```bash
aws sts get-caller-identity   # Should show your account ID
node --version                 # Should be 18+
jq --version                   # Should exist
```

---

## Deployment: One Command

```bash
cd fluxury-infra
bash scripts/deploy-beta-code.sh
```

### What the script does (in order):

| Step | What happens | Time |
|------|-------------|------|
| 1 | Checks prerequisites (node, aws, jq, credentials) | 2s |
| 2 | Shows cost estimate, asks for confirmation | — |
| 3 | Installs CDK dependencies | 10s |
| 4 | Bootstraps CDK (first time only) | 30s |
| 5 | Synthesizes CloudFormation template | 10s |
| 6 | **Deploys infrastructure** (Lambda, DynamoDB, S3, Cognito, CloudFront, API Gateway) | 5-10 min |
| 7 | Parses deployment outputs (API URL, User Pool ID, etc.) | 2s |
| 8 | Auto-generates `fluxury-app/.env.beta` with real values | 2s |
| 9 | **Prompts for your email + password** → creates Cognito user | 10s |
| 10 | **Asks** if you want to build + deploy frontend now | — |
| 11 | Builds frontend with real env vars, uploads to S3, invalidates CloudFront | 1-2 min |

### After the script finishes:

You'll get a CloudFront URL like:
```
https://d1a2b3c4d5e6f.cloudfront.net
```

Open that on your phone. Login with the email/password you entered. You're live.

---

## Seeding Beats

After deployment, run the seed script to upload your 5 .wav beats to S3:

```bash
cd fluxury-infra
bash scripts/seed-beats.sh
```

It will:
- Authenticate with your credentials
- Upload each .wav to S3 (`beats/beat-{name}/audio.wav`)
- Register each beat in DynamoDB via the API
- Skip any beats that already exist (idempotent)

---

## What Gets Created in AWS

| Resource | Name | Purpose |
|----------|------|---------|
| DynamoDB Table | `fluxury-beta-sessions-beta` | Session + beat metadata |
| S3 Bucket | `fluxury-beta-files-{account}-{region}` | Scripts, beats, artwork |
| S3 Bucket | `fluxury-beta-frontend-{account}-{region}` | Built Vue app |
| CloudFront Distribution | auto-generated | HTTPS frontend hosting |
| Cognito User Pool | `fluxury-beta-users` | Authentication (your login) |
| Cognito Identity Pool | `fluxury_beta_identity_pool` | S3 access from browser |
| API Gateway | `FluxuryApp Beta API` | REST endpoints |
| Lambda (Sessions) | `FluxuryBeta-SessionsFunction` | CRUD for sessions |
| Lambda (Beats) | `FluxuryBeta-BeatsFunction` | CRUD for beats |

---

## Environments

| Environment | `VITE_DEMO_MODE` | Backend | Data |
|-------------|------------------|---------|------|
| **Local Dev** | `true` (default) | Mock (in-memory) | Fake data, resets on reload |
| **Beta** | `false` | Real AWS | Persists in DynamoDB + S3 |

Switch between them:
- **Demo mode**: `npm run dev` (uses `.env.local` which has `VITE_DEMO_MODE=true`)
- **Beta mode locally**: `npm run dev -- --mode beta` (uses `.env.beta` with real AWS)
- **Deployed**: The built bundle always uses `.env.beta` values baked in at build time

---

## Testing Procedures

### Before Deployment (all automated)

```bash
cd fluxury-app

# Unit + property tests (153 tests, ~15s)
npm test

# E2E tests (3 tests, ~11s, needs Playwright installed)
npm run test:e2e

# Type checking
npm run typecheck

# Lint
npm run lint
```

All four must pass before deploying.

### After Deployment (manual verification)

| # | Test | Expected Result |
|---|------|-----------------|
| 1 | Open CloudFront URL in browser | AuthForm appears |
| 2 | Login with your email/password | Redirects to sessions list |
| 3 | Sessions list is empty (first time) | "No Song Selected" or empty list |
| 4 | Go to Beats → tap a beat → Play | Audio streams from S3 |
| 5 | Tap "Write to this beat" | New session created, editor opens |
| 6 | Type lyrics, wait 2s | "Saved · just now" appears |
| 7 | Close tab completely | — |
| 8 | Reopen URL → login → open session | Lyrics are still there |
| 9 | Open on a different device/network | Same session appears |
| 10 | Turn off wifi, type more lyrics | "Offline — saved locally" |
| 11 | Turn wifi back on | Auto-syncs, shows "Saved" |

### Smoke Test Script

After deployment, you can also run:
```bash
cd fluxury-infra
bash scripts/verify-deployment.sh  # (TODO: create this in next session)
```

---

## Risks and What Could Go Wrong

| Risk | Likelihood | What you'll see | Fix |
|------|-----------|----------------|-----|
| AWS credentials expired | Medium | Script fails at step 1 | `aws configure` or refresh SSO |
| CDK bootstrap needed | First time only | Script handles it automatically | — |
| CloudFormation rollback | Low | Deploy fails with stack error | Check AWS Console → CloudFormation → Events |
| CORS error (API blocked) | Medium | "Network Error" in console | Verify `allowedOrigin` context matches your domain |
| Cognito user already exists | Common on re-run | Script warns and continues | No action needed |
| S3 permissions denied | Medium | "No AWS credentials" error in app | Check Identity Pool IAM role |
| Lambda cold start (3-5s) | High (first request) | Slow first API call after idle | Normal — wait a moment |
| CloudFront serves stale HTML | Medium | Old version of app after redeploy | Run `aws cloudfront create-invalidation` |
| Token expires during long session | Low | 401 error, redirects to login | Normal — refresh token is 7 days |
| DynamoDB TTL deletes old sessions | Possible | Sessions disappear after 90 days | Remove TTL attribute from table if unwanted |

---

## Redeploying After Code Changes

If you make changes and want to update the live app:

### Frontend only (no infrastructure changes):
```bash
cd fluxury-app
npm run build -- --mode beta
cd ../fluxury-infra
aws s3 sync ../fluxury-app/dist/assets/ "s3://$(jq -r '.FluxuryBeta.FrontendBucketName' cdk-outputs-beta.json)/assets/" --cache-control "max-age=31536000,immutable" --delete
aws s3 cp ../fluxury-app/dist/index.html "s3://$(jq -r '.FluxuryBeta.FrontendBucketName' cdk-outputs-beta.json)/index.html" --cache-control "max-age=300"
aws cloudfront create-invalidation --distribution-id "$(jq -r '.FluxuryBeta.CloudFrontDistributionId' cdk-outputs-beta.json)" --paths "/*"
```

### Backend changes (Lambda code, CDK stack):
```bash
cd fluxury-infra
cdk deploy FluxuryBeta --require-approval never --outputs-file ./cdk-outputs-beta.json
```

### Full redeploy (both):
```bash
cd fluxury-infra
bash scripts/deploy-beta-code.sh
```

---

## Cost Breakdown (Monthly Estimate)

| Service | Cost | Why |
|---------|------|-----|
| Lambda | $0-1 | Pay-per-invocation, single user = ~100 calls/day |
| DynamoDB | $0-1 | Pay-per-request, minimal reads/writes |
| S3 | $0.50 | Storing beats (~20MB) + scripts |
| API Gateway | $0-1 | Per-request pricing |
| CloudFront | $0-1 | Low traffic single user |
| Cognito | $0 | Free tier covers 50,000 MAU |
| **Total** | **~$2-5/month** | At single-user scale |

---

## Tearing Down (If You Want to Stop Paying)

```bash
cd fluxury-infra
cdk destroy FluxuryBeta
```

⚠️ This deletes ALL data (sessions, beats, user account). It's irreversible.

---

## File Reference

| File | Purpose |
|------|---------|
| `fluxury-infra/scripts/deploy-beta-code.sh` | Main deployment script |
| `fluxury-infra/scripts/seed-beats.sh` | Upload beats to S3 + register in API |
| `fluxury-infra/lib/beta-stack.ts` | CDK infrastructure definition |
| `fluxury-infra/lib/lambdas/sessions.ts` | Sessions API Lambda |
| `fluxury-infra/lib/lambdas/beats.ts` | Beats API Lambda |
| `fluxury-infra/cdk-outputs-beta.json` | Generated after deploy — resource IDs |
| `fluxury-app/.env.beta` | Auto-generated — real AWS config for frontend |
| `fluxury-app/.env.local` | Demo mode config (default for `npm run dev`) |
| `fluxury-app/src/services/api/index.ts` | Canonical API surface (switches mock/real) |
| `fluxury-app/src/services/api/real.ts` | Real AWS API client |
| `fluxury-app/src/services/s3Service.ts` | Direct S3 access via Identity Pool |
| `fluxury-app/src/api/auth-interceptor.ts` | JWT injection + token refresh |

---

## Quick Reference Commands

```bash
# Run locally in demo mode (no AWS needed)
cd fluxury-app && npm run dev

# Run tests
cd fluxury-app && npm test

# Run E2E tests
cd fluxury-app && npm run test:e2e

# Deploy everything
cd fluxury-infra && bash scripts/deploy-beta-code.sh

# Seed beats after deploy
cd fluxury-infra && bash scripts/seed-beats.sh

# Redeploy frontend only
cd fluxury-app && npm run build -- --mode beta
# then S3 sync + CloudFront invalidation (see Redeploying section)

# Tear down (destroys all data!)
cd fluxury-infra && cdk destroy FluxuryBeta
```
