<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const auth = useAuthStore()

const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

const mode = ref<'signIn' | 'signUp'>('signIn')
const username = ref(isDemoMode ? 'demo' : '')
const email = ref('')
const password = ref(isDemoMode ? 'demo1234' : '')

const title = computed(() =>
  mode.value === 'signIn' ? 'Sign in to Fluxury' : 'Create your Fluxury account'
)

async function submit() {
  auth.clearError()
  if (mode.value === 'signIn') {
    const result = await auth.login(username.value.trim(), password.value)
    if (result.success) {
      await router.push('/sessions')
    }
  } else {
    const result = await auth.register(
      username.value.trim(),
      email.value.trim(),
      password.value
    )
    if (result.success && auth.isAuthenticated) {
      await router.push('/sessions')
    }
  }
}

function toggleMode() {
  auth.clearError()
  mode.value = mode.value === 'signIn' ? 'signUp' : 'signIn'
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-100 px-4">
    <div class="w-full max-w-md bg-white rounded-lg shadow-md p-8">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-semibold">{{ title }}</h2>
        <p v-if="isDemoMode" class="mt-2 text-sm text-indigo-600">
          Demo mode — any credentials will work
        </p>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700">Username</label>
          <input
            v-model="username"
            type="text"
            required
            autocomplete="username"
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div v-if="mode === 'signUp'">
          <label class="block text-sm font-medium text-gray-700">Email</label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700">Password</label>
          <input
            v-model="password"
            type="password"
            required
            :autocomplete="mode === 'signIn' ? 'current-password' : 'new-password'"
            class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <p v-if="auth.error" class="text-sm text-red-600">{{ auth.error }}</p>

        <button
          type="submit"
          :disabled="auth.isLoading"
          class="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 disabled:opacity-60"
        >
          {{ auth.isLoading ? 'Please wait…' : (mode === 'signIn' ? 'Sign in' : 'Create account') }}
        </button>
      </form>

      <button
        type="button"
        class="mt-4 w-full text-sm text-indigo-600 hover:underline"
        @click="toggleMode"
      >
        {{ mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in' }}
      </button>
    </div>
  </div>
</template>
