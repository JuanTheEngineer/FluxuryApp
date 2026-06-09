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

// Configure AWS Amplify
Amplify.configure(awsExports)

const app = createApp(App)

app.use(router)
app.use(createPinia())
app.mount('#app')
