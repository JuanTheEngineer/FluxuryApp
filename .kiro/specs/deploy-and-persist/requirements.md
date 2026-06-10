# Requirements Document

## Introduction

Deploy the Fluxury rap-writing app's AWS backend infrastructure, wire the frontend to real persistence services, and host the application at a publicly accessible HTTPS URL. This transforms the app from a demo-mode prototype into a single-user production system where sessions, lyrics, and beats persist across devices and browser sessions.

## Glossary

- **CDK_Stack**: The AWS CDK application defined in `fluxury-infra/` that provisions all backend resources via CloudFormation
- **Beta_Environment**: The cost-optimized AWS deployment target defined in `beta-stack.ts`, using pay-per-request DynamoDB and minimal Lambda memory
- **API_Gateway**: The AWS REST API endpoint that routes HTTP requests to Lambda functions, secured by Cognito authorization
- **Sessions_Table**: The DynamoDB table storing session metadata (id, userId, title, beat, timestamps)
- **Files_Bucket**: The S3 bucket storing session scripts (JSON), beat audio files (.wav), and artwork
- **User_Pool**: The Cognito User Pool that authenticates the developer and issues JWT tokens
- **Auth_Interceptor**: The axios request interceptor (`auth-interceptor.ts`) that injects the current Cognito JWT into outbound API calls
- **Real_API_Client**: The axios-based API surface (`real.ts`) that communicates with the deployed API Gateway
- **Frontend_Host**: The S3 + CloudFront distribution (or equivalent static hosting) serving the built Vue app over HTTPS
- **Deploy_Script**: The shell script (`deploy-beta-code.sh`) that orchestrates CDK synthesis, deployment, and output extraction
- **Seed_Script**: A one-time script that uploads the 5 local beat .wav files into the Files_Bucket so the deployed app has initial content
- **Environment_Config**: The `.env.beta` file containing real AWS resource identifiers injected at build time via Vite

## Requirements

### Requirement 1: CDK Stack Deployment

**User Story:** As the developer, I want to deploy the beta CDK stack to my AWS account, so that all backend resources are provisioned and ready to serve requests.

#### Acceptance Criteria

1. WHEN the Deploy_Script is executed, THE CDK_Stack SHALL synthesize and deploy the Beta_Environment to the configured AWS account in us-east-1
2. WHEN deployment completes successfully, THE CDK_Stack SHALL output the API_Gateway URL, User_Pool ID, User_Pool client ID, and Files_Bucket name to `cdk-outputs-beta.json`
3. WHEN deployment completes successfully, THE Deploy_Script SHALL write real resource identifiers into the Environment_Config file (`fluxury-app/.env.beta`)
4. IF deployment fails due to missing AWS credentials, THEN THE Deploy_Script SHALL display an actionable error message and exit with a non-zero code
5. IF deployment fails due to a CloudFormation rollback, THEN THE Deploy_Script SHALL preserve error output for debugging and exit with a non-zero code
6. WHEN the Beta_Environment is deployed, THE Sessions_Table SHALL be created with pay-per-request billing, a partition key of `id`, a sort key of `userId`, and a GSI on `userId` + `created`
7. WHEN the Beta_Environment is deployed, THE Files_Bucket SHALL be created with private access and no lifecycle expiration rule by default
8. WHERE a lifecycle expiration is configured via a CDK context variable `bucketExpirationDays`, THE Files_Bucket SHALL apply a lifecycle rule deleting objects after the specified number of days
9. WHEN the Beta_Environment is deployed, THE API_Gateway SHALL be created with CORS headers allowing origins `https://juantheengineer.com` and `http://localhost:5173`

### Requirement 2: Single-User Cognito Authentication

**User Story:** As the developer, I want a pre-created Cognito account that I can log into from the AuthForm, so that I can access the app without needing a registration flow.

#### Acceptance Criteria

1. WHEN the Beta_Environment is deployed, THE User_Pool SHALL be created with email and username sign-in aliases, a minimum password length of 8 characters, and self-signup disabled
2. WHEN the Deploy_Script completes, THE Deploy_Script SHALL create one confirmed Cognito user with the developer's email and a pre-set password using the AWS CLI `admin-create-user` and `admin-set-user-password` commands
3. WHEN the developer submits valid credentials on the AuthForm, THE User_Pool SHALL issue an ID token, access token, and refresh token
4. WHEN the developer submits invalid credentials on the AuthForm, THE AuthForm SHALL display a descriptive error message without revealing whether the username or password is incorrect
5. WHILE the developer holds a valid refresh token, THE User_Pool SHALL issue new ID tokens without requiring re-authentication
6. THE User_Pool client SHALL use SRP-based authentication flow without generating a client secret
7. THE User_Pool SHALL configure refresh token validity to 7 days

### Requirement 3: API Request Authentication

**User Story:** As the developer, I want API calls to automatically include my JWT token, so that I can access protected endpoints without manual token management.

#### Acceptance Criteria

1. WHEN a request is made through the Real_API_Client, THE Auth_Interceptor SHALL attach the current Cognito ID token in the `Authorization: Bearer <token>` header
2. IF the current ID token has expired, THEN THE Auth_Interceptor SHALL attempt a silent token refresh using the refresh token before retrying the request
3. IF both the ID token and refresh token are expired, THEN THE Real_API_Client SHALL emit a 401 warning and the app SHALL redirect the developer to the AuthForm
4. WHEN the API_Gateway receives a request with a valid JWT, THE API_Gateway SHALL extract the `userId` claim and pass it to the Lambda function

### Requirement 4: Session Persistence via Real API

**User Story:** As the developer, I want sessions created in the app to persist in DynamoDB, so that my writing survives tab closures and device switches.

#### Acceptance Criteria

1. WHEN the developer creates a new session, THE Real_API_Client SHALL POST to `/sessions` and THE Sessions_Table SHALL store the session metadata with a unique `id` and the authenticated `userId`
2. WHEN the developer opens the sessions list, THE Real_API_Client SHALL GET `/sessions` and return all sessions belonging to the authenticated user
3. WHEN the developer opens a specific session, THE Real_API_Client SHALL GET `/sessions/{id}` and return the full session data including the script content
4. WHEN the autosave composable triggers a save, THE Real_API_Client SHALL PUT to `/sessions/{id}` with the updated metadata and script content
5. WHEN the developer deletes a session, THE Real_API_Client SHALL DELETE `/sessions/{id}` and THE Sessions_Table SHALL remove the corresponding record
6. IF a network error occurs during save, THEN THE Real_API_Client SHALL preserve the local draft and display a connectivity warning via the existing notification system

### Requirement 5: Script and File Storage in S3

**User Story:** As the developer, I want session scripts and beat audio to be stored in S3, so that large files are handled outside the database and are efficiently retrievable.

#### Acceptance Criteria

1. WHEN a session script is saved, THE Real_API_Client SHALL upload the script JSON to the Files_Bucket at the path `sessions/{sessionId}/script.json`
2. WHEN a session is loaded, THE Real_API_Client SHALL download the script JSON from `sessions/{sessionId}/script.json` in the Files_Bucket
3. WHEN a beat file is uploaded, THE Real_API_Client SHALL upload the .wav file to the Files_Bucket at the path `beats/{beatId}/audio.wav`
4. WHEN a beat is played in the BeatPlayer, THE BeatPlayer SHALL stream the audio from the Files_Bucket via authenticated S3 requests using Cognito Identity Pool credentials
5. WHEN the Beta_Environment is deployed, THE CDK_Stack SHALL create a Cognito Identity Pool linked to the User_Pool, granting authenticated users read/write access to the Files_Bucket
6. FOR ALL valid session script objects, uploading then downloading SHALL produce an equivalent JSON object (round-trip property)

### Requirement 6: Beat Seeding

**User Story:** As the developer, I want the 5 existing local beats uploaded to S3 during initial deployment, so that the deployed app has playable content from day one.

#### Acceptance Criteria

1. WHEN the Seed_Script is executed after deployment, THE Seed_Script SHALL upload all 5 .wav files from `public/beats/` to the Files_Bucket under the `beats/` prefix
2. WHEN the Seed_Script uploads a beat, THE Seed_Script SHALL call the beats API endpoint (POST /beats) to create a corresponding metadata entry so the beat appears in the beat list
3. WHEN the deployed app loads the beat list, THE Real_API_Client SHALL return all 5 seeded beats with their S3 URLs
4. IF a beat with the same filename already exists in the beats API response, THEN THE Seed_Script SHALL skip the upload for that beat and log a message

### Requirement 7: Frontend Deployment and Hosting

**User Story:** As the developer, I want the built Vue app served over HTTPS at juantheengineer.com/fluxury, so that I can access it from any device with a browser.

#### Acceptance Criteria

1. WHEN the frontend build command is run with `--mode beta`, THE build process SHALL produce a production bundle with real AWS resource identifiers from the Environment_Config
2. WHEN the built assets are uploaded to the Frontend_Host, THE Frontend_Host SHALL serve the app over HTTPS with a valid TLS certificate
3. WHEN a user navigates to `https://juantheengineer.com/fluxury`, THE Frontend_Host SHALL serve the Vue app's `index.html`
4. WHEN a user navigates to a deep link within the app (e.g., `/fluxury/session/123`), THE Frontend_Host SHALL serve `index.html` to support client-side routing
5. THE Frontend_Host SHALL set appropriate cache headers: immutable hashed assets cached for 1 year, `index.html` cached for no more than 5 minutes

### Requirement 8: Environment Configuration

**User Story:** As the developer, I want a single environment file that switches the app from demo mode to real mode, so that I don't need to change code to target real AWS services.

#### Acceptance Criteria

1. WHEN `VITE_DEMO_MODE` is set to `false` in the Environment_Config, THE app SHALL use the Real_API_Client for all data operations instead of mock data
2. THE Environment_Config SHALL contain values for `VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_USER_POOL_CLIENT_ID`, `VITE_S3_BUCKET_NAME`, and `VITE_AWS_REGION`
3. WHEN the app is built, THE build process SHALL inline environment values from the active `.env` file into the bundle via Vite's `import.meta.env`
4. IF any required environment variable is missing at build time, THEN THE build process SHALL fail with a descriptive error identifying the missing variable

### Requirement 9: CORS and Cross-Origin Access

**User Story:** As the developer, I want the API and S3 bucket to accept requests from the deployed frontend origin, so that cross-origin browser requests succeed.

#### Acceptance Criteria

1. THE API_Gateway SHALL include the configured frontend origin in its `Access-Control-Allow-Origin` response header, where the origin is provided via a CDK context variable `allowedOrigin`
2. THE API_Gateway SHALL allow the HTTP methods GET, POST, PUT, DELETE, and OPTIONS in its CORS configuration
3. THE API_Gateway SHALL allow the headers `Content-Type`, `Authorization`, `X-Amz-Date`, `X-Api-Key`, `X-Amz-Security-Token`, and `X-Amz-User-Agent`
4. WHEN a preflight OPTIONS request is received, THE API_Gateway SHALL respond with status 200 and appropriate CORS headers without requiring authentication
5. THE Files_Bucket SHALL have a CORS configuration allowing GET requests from the configured frontend origin for audio streaming
6. THE CDK_Stack SHALL accept the allowed CORS origin as a context variable, defaulting to `https://juantheengineer.com`, so that domain changes require only a configuration update

### Requirement 10: End-to-End Verification

**User Story:** As the developer, I want to verify the complete flow from login through session creation to data retrieval on another device, so that I have confidence the system works before daily use.

#### Acceptance Criteria

1. WHEN the developer opens the deployed URL on a mobile device, THE Frontend_Host SHALL serve the app and THE AuthForm SHALL be displayed
2. WHEN the developer logs in with valid credentials, THE app SHALL navigate to the sessions list and display any previously created sessions
3. WHEN the developer creates a session, writes lyrics, and closes the browser tab, THE session data SHALL persist in the Sessions_Table and Files_Bucket
4. WHEN the developer reopens the app and navigates to the session, THE app SHALL display the previously written lyrics with no data loss
5. WHEN the developer plays a seeded beat, THE BeatPlayer SHALL stream audio from the Files_Bucket without buffering delays exceeding 3 seconds on a standard mobile connection
6. WHILE the device has no internet connectivity, THE app SHALL continue to function using the local draft fallback and SHALL sync when connectivity returns
