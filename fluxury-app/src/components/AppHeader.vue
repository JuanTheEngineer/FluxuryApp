<template>
  <header class="bg-white shadow-md px-6 py-4 flex justify-between items-center">
    <router-link to="/" class="text-xl font-bold text-indigo-700">Fluxury</router-link>

    <nav class="space-x-4">
      <router-link to="/beats" class="text-gray-700 hover:underline">Beats</router-link>
      <router-link to="/sessions" class="text-gray-700 hover:underline">Sessions</router-link>
    </nav>

    <div>
      <span v-if="auth.user" class="mr-3 text-sm text-gray-500">
        Hello, {{ auth.user.attributes?.email || auth.user.username }}
      </span>
      <button
          v-if="auth.user"
          @click="auth.logout"
          class="text-sm bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
      >
        Logout
      </button>
      <router-link
          v-else
          to="/login"
          class="text-sm bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
      >
        Login
      </router-link>
    </div>
  </header>
</template>

<script setup>
import { useAuthStore } from '../stores/authStore'
const auth = useAuthStore()
</script>
