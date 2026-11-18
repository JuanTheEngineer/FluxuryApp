<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { afterSignIn } from '@/router/authGuard'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

/** Sent here because a saved login expired (see router/authGuard.ts). */
const loginExpired = computed(() => route.query.reason === 'expired')

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

const mode = ref<'signIn' | 'signUp'>('signIn')
const username = ref(isDemoMode ? 'demo' : '')
const email = ref('')
const password = ref(isDemoMode ? 'demo1234' : '')
const localError = ref('')

const title = computed(() =>
  mode.value === 'signIn' ? 'Sign in to Fluxury' : 'Create your Fluxury account'
)

const displayError = computed(() => localError.value || auth.error || '')

async function submit() {
  auth.clearError()
  localError.value = ''

  if (!username.value.trim() || !password.value) {
    localError.value = 'Please enter both username and password'
    return
  }

  if (mode.value === 'signIn') {
    const result = await auth.login(username.value.trim(), password.value)
    if (result.success) {
      // replace: Back shouldn't return to the sign-in page
      await router.replace(afterSignIn(route.query))
    } else {
      localError.value = result.error || 'Incorrect username or password'
    }
  } else {
    const result = await auth.register(
      username.value.trim(),
      email.value.trim(),
      password.value
    )
    if (result.success && auth.isAuthenticated) {
      await router.replace(afterSignIn(route.query))
    } else {
      localError.value = result.error || 'Registration failed'
    }
  }
}

function toggleMode() {
  auth.clearError()
  localError.value = ''
  mode.value = mode.value === 'signIn' ? 'signUp' : 'signIn'
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface px-4">
    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="text-center mb-8">
        <img src="/home-view-logo.png" alt="Fluxury" class="h-16 mx-auto mb-4" />
        <p class="text-slate-400 text-sm">Write lyrics. Hear beats. Stay in flow.</p>
      </div>

      <div class="bg-surface-elevated rounded-xl border border-slate-700 p-6">
        <h2 class="text-xl font-bold text-slate-100 text-center mb-6">{{ title }}</h2>

        <p v-if="isDemoMode" class="text-center text-sm text-amber-500 mb-4">
          Demo mode — any credentials will work
        </p>

        <!-- Why you're here, when your saved login expired -->
        <div
          v-if="loginExpired && mode === 'signIn'"
          role="status"
          data-testid="login-expired"
          class="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4"
        >
          <p class="text-sm text-amber-300">Your session expired. Sign in again to keep writing.</p>
        </div>

        <!-- Error message -->
        <div v-if="displayError" class="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
          <p class="text-sm text-red-400">{{ displayError }}</p>
        </div>

        <form @submit.prevent="submit" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Username</label>
            <input
              v-model="username"
              type="text"
              required
              autocomplete="username"
              class="w-full bg-surface border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
              placeholder="Enter username"
            />
          </div>

          <div v-if="mode === 'signUp'">
            <label class="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="w-full bg-surface border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
              placeholder="Enter email"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input
              v-model="password"
              type="password"
              required
              :autocomplete="mode === 'signIn' ? 'current-password' : 'new-password'"
              class="w-full bg-surface border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-500 transition-colors"
              placeholder="Enter password"
            />
          </div>

          <button
            type="submit"
            :disabled="auth.isLoading"
            class="w-full bg-amber-500 text-black py-2.5 rounded-lg font-medium hover:bg-amber-400 disabled:opacity-60 transition-colors"
          >
            {{ auth.isLoading ? 'Please wait…' : (mode === 'signIn' ? 'Sign in' : 'Create account') }}
          </button>
        </form>

        <button
          type="button"
          class="mt-4 w-full text-sm text-slate-400 hover:text-amber-500 transition-colors"
          @click="toggleMode"
        >
          {{ mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in' }}
        </button>
      </div>
    </div>
  </div>
</template>
