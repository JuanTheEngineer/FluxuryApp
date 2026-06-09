# 🎧 FluxuryApp Frontend

Vue.js 3 frontend for the FluxuryApp rap writing platform. Features rich text editing, audio playback, session management, and real-time collaboration tools.

## 🚀 Quick Start

### **Demo Mode** (No AWS Required)
```bash
npm install
cp .env.demo .env.local
npm run dev
```
Visit: http://localhost:5173

### **Beta Environment**
```bash
npm install
npm run build -- --mode beta
# Upload dist/ to juantheengineer.com/fluxury
```

### **Development with AWS**
```bash
npm install
cp .env.beta .env.local
# Update .env.local with your AWS credentials
npm run dev
```

## 🎯 Features

- **Rich Text Editor**: Quill.js-powered lyrics editor with formatting
- **Audio Playback**: Synchronized beat playback with timeline seeking
- **Session Management**: Create, save, and organize rap sessions
- **Beat Library**: Upload and manage custom beats
- **User Authentication**: AWS Cognito integration
- **Real-time Collaboration**: Share sessions with other users
- **Mobile Responsive**: Works seamlessly on all devices

## 🛠️ Tech Stack

- **Vue.js 3** + Composition API
- **TypeScript** for type safety
- **Vite** for fast development and building
- **TailwindCSS** for styling
- **Pinia** for state management
- **Vue Router** for navigation
- **Quill.js** for rich text editing
- **Howler.js** for audio playback
- **AWS Amplify** for authentication

## 📂 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── BeatPlayer.vue     # Audio playback component
│   ├── SessionEditor.vue  # Main lyrics editor
│   ├── BeatLibrary.vue    # Beat selection interface
│   └── DemoBanner.vue     # Demo mode indicator
├── views/               # Page components
│   ├── HomeView.vue       # Landing page
│   ├── SessionsView.vue   # Session management
│   └── SessionEditorView.vue  # Session editing page
├── stores/              # Pinia state management
│   ├── authStore.ts       # Authentication state
│   ├── beatStore.ts       # Beat management
│   └── sessionStore.ts    # Session data
├── services/            # API and external services
│   ├── api-clients.ts     # AWS API clients
│   ├── mockApiService.ts  # Demo mode APIs
│   └── s3Service.ts       # File upload service
├── data/               # Mock data for demo mode
│   └── mockData.ts        # Sample sessions and beats
├── router/             # Vue Router configuration
└── composables/        # Reusable composition functions
```

## 🌐 Environment Configurations

### **Demo Mode** (`.env.demo`)
- No AWS dependencies
- Mock data and services
- Perfect for development and testing
- Zero cost to run

### **Beta Mode** (`.env.beta`)
- AWS backend integration
- Cost-optimized settings
- Beta testing features
- Auto-configured after infrastructure deployment

### **Production Mode** (`.env.production`)
- Full production features
- Enhanced monitoring
- Optimized performance
- Custom domain support

## 🔧 Build Commands

```bash
# Development server
npm run dev

# Build for specific environment
npm run build -- --mode demo
npm run build -- --mode beta
npm run build -- --mode production

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📱 Component Guide

### **BeatPlayer**
Audio playback with timeline controls:
```vue
<BeatPlayer
  :beat="currentBeat"
  :is-playing="isPlaying"
  @play="handlePlay"
  @pause="handlePause"
  @seek="handleSeek"
/>
```

### **SessionEditor**
Rich text editor for lyrics:
```vue
<SessionEditor
  v-model="sessionContent"
  :auto-save="true"
  @save="handleSave"
/>
```

### **BeatLibrary**
Beat selection interface:
```vue
<BeatLibrary
  :beats="availableBeats"
  @select="handleBeatSelect"
  @upload="handleBeatUpload"
/>
```

## 🔐 Authentication

### AWS Cognito Integration
```typescript
// Login
import { useAuthStore } from '@/stores/authStore'
const authStore = useAuthStore()
await authStore.signIn(email, password)

// Check authentication
if (authStore.isAuthenticated) {
  // User is logged in
}
```

### Demo Mode
```typescript
// Mock authentication (no AWS required)
await authStore.signInDemo(username)
```

## 💾 Data Management

### Session Storage
```typescript
import { useSessionStore } from '@/stores/sessionStore'
const sessionStore = useSessionStore()

// Create session
await sessionStore.createSession({
  name: 'My New Track',
  author: 'Artist Name'
})

// Save session
await sessionStore.saveSession(sessionId, content)
```

### Beat Management
```typescript
import { useBeatStore } from '@/stores/beatStore'
const beatStore = useBeatStore()

// Upload beat
await beatStore.uploadBeat(file)

// Get available beats
const beats = await beatStore.getBeats()
```

## 🎨 Styling

### TailwindCSS Classes
- `bg-gradient-to-br from-purple-900 to-blue-900` - Main background
- `glass-card` - Custom glass effect component
- `text-fluxury-gold` - Brand color text
- `btn-primary` - Primary button styling

### Custom Components
```css
.glass-card {
  @apply bg-white/10 backdrop-blur-md border border-white/20 rounded-lg;
}

.text-fluxury-gold {
  @apply text-yellow-400;
}
```

## 🧪 Testing

### Demo Mode Testing
```bash
# Test with mock data
npm run dev
# Navigate to different sections
# Create/edit sessions with mock beats
```

### Beta Environment Testing
```bash
# Build and test beta build
npm run build -- --mode beta
npm run preview
```

## 🚀 Deployment

### **Beta Deployment**
After infrastructure is deployed:
```bash
# Build for beta
npm run build -- --mode beta

# Upload to domain
# Copy dist/ contents to juantheengineer.com/fluxury
```

### **Custom Domain Deployment**
```bash
# Build for production
npm run build -- --mode production

# Deploy to your hosting provider
# Configure domain routing
```

## 🔧 Configuration

### Environment Variables
```bash
# API Configuration
VITE_API_BASE_URL=https://your-api.amazonaws.com/beta
VITE_BEATS_API_BASE_URL=https://your-api.amazonaws.com/beta

# AWS Configuration
VITE_AWS_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxx
VITE_S3_BUCKET_NAME=your-bucket-name

# Feature Flags
VITE_DEMO_MODE=false
VITE_BETA_MODE=true
VITE_ENABLE_COLLABORATION=true
```

## 🚨 Troubleshooting

### Common Issues
| Problem | Solution |
|---------|----------|
| `Cannot resolve '@/...'` | Check tsconfig.json path mapping |
| `Authentication errors` | Verify Cognito configuration |
| `API CORS errors` | Check backend CORS settings |
| `Audio not playing` | Check browser audio permissions |

### Debug Mode
```typescript
// Enable debug logging
localStorage.setItem('fluxury-debug', 'true')
```

## 📚 Related Documentation

- [Infrastructure README](../fluxury-infra/README.md)
- [Component Guide](../COMPONENT_GUIDE.md)
- [Setup Guide](../SETUP_GUIDE.md)
- [Architecture Overview](../ARCHITECTURE.md)

---

**Happy rapping with FluxuryApp! 🎤🎶**

## Project setup

```
npm install
```

### Compiles and hot-reloads for development

```
npm run serve
```

### Compiles and minifies for production

```
npm run build
```

### Lints and fixes files

```
npm run lint
```

### Customize configuration

See [Configuration Reference](https://cli.vuejs.org/config/).
