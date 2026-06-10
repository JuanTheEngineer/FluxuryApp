import { useTimingMetrics } from './composables/useTimingMetrics'
const { recordAppLoadStart } = useTimingMetrics()
recordAppLoadStart()

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import './assets/main.css'
import { Amplify } from 'aws-amplify'
import awsExports from './auth'

// Validate required environment variables in real mode
if (import.meta.env.VITE_DEMO_MODE === 'false') {
  const required = ['VITE_API_BASE_URL', 'VITE_COGNITO_USER_POOL_ID', 'VITE_COGNITO_USER_POOL_CLIENT_ID', 'VITE_S3_BUCKET_NAME', 'VITE_AWS_REGION']
  const missing = required.filter(k => !import.meta.env[k])
  if (missing.length) {
    throw new Error(`[Fluxury] Missing required env vars for real mode: ${missing.join(', ')}. Check your .env.beta file.`)
  }
}

// Configure AWS Amplify
Amplify.configure(awsExports)

const app = createApp(App)

app.use(router)
app.use(createPinia())
app.mount('#app')
