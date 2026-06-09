# 🧩 FluxuryApp Component Guide

## Frontend Components Deep Dive

### 📄 Page Components (Views)

#### SessionBrowserView.vue
**Purpose**: Display all user sessions in a grid/list format
**Location**: `src/views/SessionBrowserView.vue`

**Key Features**:
- Fetches sessions from `sessionStore`
- Search and filter functionality
- Create new session button
- Session thumbnails with metadata
- Navigation to SessionEditorView

**Data Flow**:
```vue
mounted() → sessionStore.fetchSessions() → Display session list
Click session → Navigate to /session/:id
```

**Dependencies**:
- `sessionStore` (Pinia)
- `router` (Vue Router)

---

#### SessionEditorView.vue
**Purpose**: Main editing interface for rap sessions
**Location**: `src/views/SessionEditorView.vue`

**Key Features**:
- Quill.js rich text editor for lyrics
- Real-time auto-save to S3 (every 10 seconds)
- Session metadata editing (name, author, beat)
- Beat selection dropdown
- Background artwork display
- Auto-save status indicator

**Data Flow**:
```vue
Route params → Load session → Initialize Quill → Auto-save loop
Quill changes → S3Service.uploadSessionScript() → Update metadata
```

**Key Methods**:
- `loadSession()`: Initialize editor with session data
- `save()`: Manual save operation
- `toggleEdit()`: Switch between view/edit modes

**Dependencies**:
- `Quill` (Rich text editor)
- `S3Service` (File uploads)
- `sessionsApi` (API calls)
- `BeatPlayer` component

---

#### BeatBrowserView.vue
**Purpose**: Browse and select audio beats
**Location**: `src/views/BeatBrowserView.vue`

**Key Features**:
- Grid display of available beats
- Audio preview with BeatPlayer
- Search and filter by name/artist
- Beat selection for sessions
- Upload new beats button

**Data Flow**:
```vue
mounted() → beatStore.fetchBeats() → Display beat grid
Click beat → beatStore.selectBeat() → Update BeatPlayer
```

**Dependencies**:
- `beatStore` (Pinia)
- `BeatPlayer` component

---

#### AddBeatView.vue
**Purpose**: Upload new beats to the system
**Location**: `src/views/AddBeatView.vue`

**Key Features**:
- File upload with drag & drop
- Beat metadata form (name, artist, tags)
- Upload progress indicator
- Audio format validation
- Preview uploaded beat

**Data Flow**:
```vue
File selected → Validate format → beatStore.uploadBeatFile() → Create beat record
```

**Dependencies**:
- `beatStore` (Pinia)
- `S3Service` (File uploads)

---

### 🎮 Interactive Components

#### BeatPlayer.vue
**Purpose**: Advanced audio player with rap-specific features
**Location**: `src/components/BeatPlayer.vue`

**Key Features**:
- Play/pause/stop controls
- Timeline seeking with looping support
- Volume control
- Skip forward/backward (5s increments)
- Loop mode toggle
- Multiple audio format support
- Loading states and error handling

**Props**:
```typescript
{
  beatUrl?: string  // URL of audio file to play
}
```

**Audio Engine**: Uses Howler.js for cross-browser audio support

**Edge Cases Handled**:
- Invalid audio URLs
- Network connection issues
- Unsupported audio formats
- Seeking beyond track boundaries
- Loop boundary calculations

**Data Flow**:
```vue
beatUrl prop changes → Create new Howl instance → Load audio → Update UI
User seeks → Calculate boundaries → Update position → Sync UI
```

---

#### AuthForm.vue
**Purpose**: Login and registration interface
**Location**: `src/components/AuthForm.vue`

**Key Features**:
- Email/password login
- New user registration
- Email confirmation flow
- Password strength validation
- Error message display
- AWS Cognito integration

**States**:
- `login`: Standard login form
- `register`: New user registration
- `confirm`: Email confirmation code entry

**Data Flow**:
```vue
Login form → authStore.login() → AWS Cognito → JWT token → Redirect
Register → authStore.register() → Confirmation email → authStore.confirmRegistration()
```

**Dependencies**:
- `authStore` (Pinia)
- AWS Amplify Auth

---

#### NotificationToast.vue
**Purpose**: User feedback for actions (success/error messages)
**Location**: `src/components/NotificationToast.vue`

**Props**:
```typescript
{
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  visible?: boolean
}
```

**Features**:
- Auto-dismiss after duration
- Manual close button
- Smooth slide-in/out animations
- Color-coded by message type
- Icon display per type

**Usage**:
```vue
<NotificationToast
  message="Session saved successfully"
  type="success"
  :visible="showToast"
  @close="showToast = false"
/>
```

---

#### AppHeader.vue
**Purpose**: Main navigation and user menu
**Location**: `src/components/AppHeader.vue`

**Key Features**:
- Logo and app branding
- Main navigation menu
- User avatar and dropdown
- Logout functionality
- Responsive mobile menu

**Navigation Items**:
- Sessions (main view)
- Beats (beat browser)
- Profile (user settings)

---

### 🏗️ Layout Components

#### DefaultLayout.vue
**Purpose**: Main app layout wrapper
**Location**: `src/layouts/DefaultLayout.vue`

**Structure**:
```vue
<template>
  <div class="app-layout">
    <AppHeader />
    <main class="content">
      <RouterView />  <!-- Page content -->
    </main>
    <BeatPlayer />    <!-- Fixed bottom player -->
  </div>
</template>
```

**Responsibilities**:
- Consistent header across all pages
- Fixed bottom beat player
- Responsive layout handling
- Global notification area

---

## 🗃️ State Management (Pinia Stores)

### authStore.ts
**Purpose**: User authentication state and operations

**State**:
```typescript
{
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}
```

**Key Actions**:
- `checkAuthStatus()`: Verify current auth state
- `login(username, password)`: User login
- `register(username, email, password)`: New user registration
- `confirmRegistration(username, code)`: Email confirmation
- `logout()`: Sign out user

**Integration**: Works with AWS Amplify Auth and JWT interceptors

---

### sessionStore.ts
**Purpose**: Session data management and CRUD operations

**State**:
```typescript
{
  sessions: SessionSummary[]
  activeSession: GetSessionResponseContent | null
  isLoading: boolean
  error: string | null
  successMessage: string | null
}
```

**Key Actions**:
- `fetchSessions()`: Load user's sessions
- `loadSession(id)`: Get specific session
- `createSession(payload)`: Create new session
- `updateSession(id, payload)`: Update session metadata
- `deleteSession(id)`: Remove session

**Error Handling**: Comprehensive error messages with status code handling

---

### beatStore.ts
**Purpose**: Beat/audio file management

**State**:
```typescript
{
  beats: BeatSummary[]
  selectedBeat: BeatSummary | null
  isLoading: boolean
  error: string | null
  uploadProgress: number
  isUploading: boolean
}
```

**Key Actions**:
- `fetchBeats()`: Load available beats
- `createBeat(data)`: Add new beat
- `deleteBeat(id)`: Remove beat
- `selectBeat(beat)`: Set current beat for player
- `uploadBeatFile(file, id)`: Upload audio file

**Features**: Upload progress tracking, file validation, search/filter helpers

---

## 🔌 Services & Utilities

### api-clients.ts
**Purpose**: Configured API clients with authentication

**Features**:
- Auto-configured base URLs from environment
- JWT token interceptors on all requests
- CORS headers
- Error response handling
- Retry logic for failed requests

**Clients**:
- `sessionsApi`: Session CRUD operations
- `beatsApi`: Beat management operations

---

### s3Service.ts
**Purpose**: Direct S3 file operations

**Key Methods**:
- `uploadSessionScript(sessionId, data)`: Save Quill delta to S3
- `downloadSessionScript(sessionId)`: Retrieve script content
- `uploadArtwork(sessionId, file)`: Upload session artwork
- `uploadBeat(beatId, file)`: Upload audio files

**Features**:
- User-scoped file paths
- Metadata tagging
- Error handling and retries
- Progress tracking

---

### auth-interceptor.ts
**Purpose**: JWT token management for API calls

**Functions**:
- `createAuthInterceptor()`: Axios request interceptor
- `isAuthenticated()`: Check if user has valid token
- `getCurrentUser()`: Extract user info from JWT

**Integration**: Automatically attaches `Authorization: Bearer <token>` to requests

---

### useNotifications.ts (Composable)
**Purpose**: Global notification management

**Functions**:
- `addNotification(message, type, duration)`
- `showSuccess(message)` / `showError(message)`
- `removeNotification(id)`
- `clearAllNotifications()`

**Usage**:
```typescript
const { showSuccess, showError } = useNotifications()

// In component
showSuccess('Session saved successfully')
showError('Failed to load beats')
```

---

## 🎯 Component Interaction Patterns

### Parent-Child Communication
```vue
<!-- Parent passes data down -->
<BeatPlayer :beatUrl="selectedBeat?.url" />

<!-- Child emits events up -->
<AuthForm @login-success="handleLogin" @error="handleError" />
```

### Store-Component Integration
```vue
<script setup>
import { useSessionStore } from '@/stores/sessionStore'

const sessionStore = useSessionStore()

// Reactive access to store state
const { sessions, isLoading, error } = storeToRefs(sessionStore)

// Call store actions
await sessionStore.fetchSessions()
</script>
```

### Route-Based Loading
```vue
<script setup>
import { useRoute } from 'vue-router'

const route = useRoute()

onMounted(async () => {
  const sessionId = route.params.id
  await sessionStore.loadSession(sessionId)
})
</script>
```

---

## 🔄 Data Flow Patterns

### CRUD Operations
```
Component → Store Action → API Client → Lambda → Database → Response → Store → Component Update
```

### File Uploads
```
Component → S3Service → Direct S3 Upload → Store Update → UI Feedback
```

### Authentication Flow
```
Login Form → Auth Store → AWS Cognito → JWT Token → API Interceptor → Protected Requests
```

### Real-time Updates
```
User Action → Quill Editor → Auto-save Timer → S3 Upload → Metadata Update → Success Feedback
```

This guide should help you understand how all the components work together! Each component has a specific responsibility, and they communicate through well-defined interfaces using props, events, and shared state management.