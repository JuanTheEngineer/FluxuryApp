# 🎧 FluxuryApp Architecture Guide

## Overview
FluxuryApp is a full-stack web application for creating, managing, and collaborating on rap lyrics with synchronized audio beats. This guide explains how all the components work together.

## 📁 Project Structure

```
FluxuryApp/
├── fluxury-app/          # Vue.js Frontend Application
├── fluxury-infra/        # AWS CDK Infrastructure (Backend)
├── fluxury-server/       # Express.js Beat Download Server
├── fluxury-model/        # API Schema Definitions (Smithy)
├── fluxury-smithy/       # OpenAPI Generation Tools
└── package.json          # Monorepo Configuration
```

## 🏗️ System Architecture

### Frontend (Vue.js App)
```
User Browser
    ↓
Vue.js App (Port 5173)
    ↓
AWS Amplify (Authentication)
    ↓
API Gateway (AWS)
    ↓
Lambda Functions
    ↓
DynamoDB + S3
```

### Component Flow
```
User Interaction
    ↓
Vue Components
    ↓
Pinia Stores (State Management)
    ↓
API Clients (with JWT tokens)
    ↓
AWS Services
```

## 🎯 Core Concepts

### 1. Sessions
- **What**: A rap writing session containing lyrics, beats, and metadata
- **Storage**: Metadata in DynamoDB, scripts in S3
- **Features**: Real-time autosave, version history, collaboration

### 2. Beats
- **What**: Audio tracks that rappers write lyrics over
- **Storage**: Audio files in S3, metadata in DynamoDB
- **Features**: Looping, seeking, volume control, format detection

### 3. Authentication
- **How**: AWS Cognito with JWT tokens
- **Flow**: Login → Get JWT → Auto-attach to API calls
- **Protection**: All routes require authentication

## 🔍 Component Deep Dive

### Frontend Components (fluxury-app/)

#### Core Pages
- **SessionBrowserView**: List all user sessions
- **SessionEditorView**: Edit lyrics with Quill.js editor + beat player
- **BeatBrowserView**: Browse and select audio beats
- **AddBeatView**: Upload new beats to the system

#### Key Components
- **BeatPlayer**: Advanced audio player with looping, seeking, volume
- **AuthForm**: Login/register with AWS Cognito
- **NotificationToast**: User feedback for errors/success
- **AppHeader**: Navigation and user menu

#### State Management (Pinia Stores)
- **authStore**: User authentication state and operations
- **sessionStore**: Session CRUD operations and real-time updates
- **beatStore**: Beat management and upload progress

#### Services
- **api-clients**: Auto-configured API clients with JWT tokens
- **s3Service**: Direct S3 operations for file uploads
- **auth-interceptor**: Automatic JWT token injection

### Backend Infrastructure (fluxury-infra/)

#### AWS Services
- **API Gateway**: RESTful API with CORS and Cognito auth
- **Lambda Functions**: Serverless business logic
- **DynamoDB**: NoSQL database for metadata
- **S3**: File storage for audio and scripts
- **Cognito**: User authentication and management

#### Lambda Functions
- **createSession**: Create new rap sessions
- **getSessions**: List user sessions
- **getSessionById**: Get specific session details
- **saveSessionScript**: Auto-save script changes
- **saveSessionMetadata**: Update session info

#### Infrastructure as Code
- **session-stack.ts**: CDK stack defining all AWS resources
- **authMiddleware.ts**: JWT validation for protected endpoints
- **corsHeaders.ts**: CORS utilities for all responses

## 🔄 Data Flow Examples

### Creating a New Session
1. User clicks "New Session" in SessionBrowserView
2. sessionStore.createSession() called
3. API client sends POST with JWT token
4. Lambda validates JWT and creates DynamoDB record
5. S3 script file initialized
6. User redirected to SessionEditorView

### Auto-saving Script Changes
1. User types in Quill editor (SessionEditorView)
2. Every 10 seconds, auto-save triggers
3. s3Service.uploadSessionScript() uploads Delta to S3
4. sessionsApi.updateSession() updates metadata
5. Success/error feedback shown to user

### Playing a Beat
1. User selects beat in BeatBrowserView
2. beatStore.selectBeat() updates state
3. BeatPlayer component receives new beatUrl
4. Howler.js loads audio with format detection
5. Player UI updates with controls and progress

## 🔐 Security & Authentication

### JWT Flow
```
Login → Cognito → JWT Token → API Calls → Lambda Validation
```

### Protection Layers
1. **Route Guards**: Redirect unauthenticated users
2. **API Interceptors**: Auto-attach JWT tokens
3. **Lambda Middleware**: Validate tokens on every request
4. **CORS**: Restrict origins in production

## 🔧 Configuration & Environment

### Environment Variables (.env.local)
```bash
# API Endpoints
VITE_API_BASE_URL=https://your-api.amazonaws.com/prod
VITE_BEATS_API_BASE_URL=https://your-beats-api.amazonaws.com/prod

# AWS Configuration
VITE_AWS_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxx
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxx
VITE_S3_BUCKET_NAME=fluxury-session-files
```

### Development vs Production
- **Dev**: Local APIs, relaxed CORS, detailed logging
- **Prod**: AWS APIs, strict CORS, error tracking

## 🚀 Deployment Pipeline

### Frontend Deployment
1. Build Vue.js app: `npm run build`
2. Deploy to AWS Amplify or S3 + CloudFront
3. Environment variables configured in hosting platform

### Backend Deployment
1. AWS credentials configured
2. CDK deploy: `cd fluxury-infra && cdk deploy`
3. Lambda functions and infrastructure created
4. API Gateway endpoints returned

## 🔄 Real-time Features

### Auto-save System
- **Frequency**: Every 10 seconds
- **Mechanism**: Quill Delta → S3 → DynamoDB metadata update
- **Conflict Resolution**: Last-write-wins (future: operational transforms)

### Audio Synchronization
- **Beat Timeline**: Precise seeking with loop boundaries
- **Script Sync**: Future feature for lyrics-to-beat timing

## 🐛 Error Handling Strategy

### Frontend Error Handling
1. **API Errors**: Caught in stores, user-friendly messages
2. **Network Issues**: Retry logic with exponential backoff
3. **Auth Errors**: Automatic redirect to login
4. **Validation**: Real-time form validation

### Backend Error Handling
1. **Lambda Errors**: Structured error responses with CORS
2. **Database Errors**: Graceful degradation
3. **S3 Errors**: Retry with different formats/regions
4. **Auth Errors**: Clear JWT validation messages

## 📊 Performance Optimizations

### Frontend
- **Lazy Loading**: Route-based code splitting
- **Asset Optimization**: Audio format detection and fallbacks
- **State Management**: Efficient Pinia stores with getters
- **Caching**: Component-level caching for expensive operations

### Backend
- **Lambda Cold Starts**: Provisioned concurrency for critical functions
- **Database**: DynamoDB single-table design with GSIs
- **Storage**: S3 with CloudFront CDN for global access
- **API**: Gateway caching and request/response compression

## 🔮 Future Enhancements

### Planned Features
1. **Real-time Collaboration**: Multiple users editing simultaneously
2. **Audio Analysis**: Beat detection and tempo matching
3. **Version Control**: Git-like versioning for sessions
4. **Social Features**: Sharing, commenting, and collaboration
5. **Mobile App**: React Native companion app

### Technical Improvements
1. **Testing**: Unit, integration, and E2E tests
2. **Monitoring**: CloudWatch dashboards and alerts
3. **CI/CD**: Automated testing and deployment
4. **Documentation**: Interactive API docs with examples

---

## Quick Start Guide

1. **Clone & Install**: `git clone <repo> && npm run install:all`
2. **Configure Environment**: Copy `.env.local` and update URLs
3. **Deploy Backend**: `cd fluxury-infra && cdk deploy`
4. **Start Frontend**: `cd fluxury-app && npm run dev`
5. **Create Account**: Register at `http://localhost:5173`

For detailed setup instructions, see `SETUP.md`
For API documentation, see `API.md`
For contributing guidelines, see `CONTRIBUTING.md`