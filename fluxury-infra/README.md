# 📦 Fluxury Infra (AWS CDK)

This package provisions all backend infrastructure for the Fluxury rap session app, including:

- ✅ DynamoDB for session metadata
- ✅ S3 for storing beat files, Quill deltas, and artwork
- ✅ Lambda functions for session API
- ✅ API Gateway (secured with Cognito JWT)
- ✅ Cognito User Pool for auth

---

## 🚀 Deploy Instructions

### ✅ Prerequisites

- AWS CLI configured with valid credentials:
  ```bash
  aws configure
  ```

- CDK CLI installed:
  ```bash
  npm install -g aws-cdk
  ```

- Project dependencies installed:
  ```bash
  npm install
  ```

---

## 📁 Project Structure

```
infra/
├── lib/
│   └── session-stack.ts       # CDK stack: API, Lambdas, DynamoDB, S3, Cognito
├── lambdas/                   # All API handlers
│   ├── utils/
│   │   └── authMiddleware.ts  # JWT + withAuth wrapper
│   └── [api].ts               # createSession, getSessions, etc.
├── cdk.json
├── package.json
```

---

## 🛠️ Configuration: Hardcoded Identifiers

You must update **Cognito identifiers manually** inside:

### `lambdas/utils/authMiddleware.ts`

```ts
const region = 'us-east-1'
const userPoolId = 'us-east-1_XXXXXXX'         // ← update this
const clientId = 'xxxxxxxxxxxxxxxxxxxxxxxxxx'  // ← update this
```

You can get these from:

- AWS Console → Cognito → User Pools → Fluxury Pool → Pool ID
- AWS Console → App clients → Client ID

---

## ✏️ Modify API Gateway Integration

In `session-stack.ts`, for each method that requires auth, you must attach the Cognito authorizer:

```ts
resource.addMethod('POST', new LambdaIntegration(fn), {
  authorizer,
  authorizationType: AuthorizationType.COGNITO
})
```

Also ensure:
```ts
const authorizer = new CognitoUserPoolsAuthorizer(this, 'FluxuryAuthorizer', {
  cognitoUserPools: [userPool],
  identitySource: 'method.request.header.Authorization'
})
```

---

## 🚀 Deploying the Stack

1. Bootstrap (first-time only):

   ```bash
   cdk bootstrap
   ```

2. Deploy:

   ```bash
   cdk deploy
   ```

   You'll see outputs like:
   ```
   FluxuryInfraStack.FluxuryUserPoolId = us-east-1_XXXXXXX
   FluxuryInfraStack.FluxuryUserPoolClientId = xxxxxxxxxxxxx
   FluxuryInfraStack.FluxurySessionAPIEndpoint = https://abc123.execute-api.us-east-1.amazonaws.com/prod
   ```

---

## 🧠 After Deployment

### ✅ Update Frontend:
In `src/auth.ts`:

```ts
Amplify.configure({
  Auth: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_XXXXXXX',       // update
    userPoolWebClientId: 'xxxxxxxxxx',     // update
  }
})
```

In `src/services/sessionApi.ts`:
```ts
baseURL: 'https://abc123.execute-api.us-east-1.amazonaws.com/prod/sessions'
```

---

## 🧪 Verify Everything Works

1. Sign up and log in from the frontend
2. Create a session → check DynamoDB + S3
3. Script autosaves to `/sessions/{id}/script.json`
4. Artwork (if added) stores to `/sessions/{id}/artwork.jpg`
5. API calls fail if token is missing or invalid (`401`)

---

## 📦 Optional Additions

- `uploadArtwork.ts` for handling images
- WAF throttling
- CORS restrictions on API Gateway
- Versioning for script files
- Rate limits per user (via token claims)

---

## 👨‍🔧 Troubleshooting

| Problem | Fix |
|--------|------|
| `401 Unauthorized` | Double-check pool/client ID in authMiddleware.ts and frontend |
| Lambda not running | Check CloudWatch logs |
| No `Authorization` header | Ensure frontend attaches token via Amplify |
| CORS issue | Add CORS headers in API Ga

# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template
