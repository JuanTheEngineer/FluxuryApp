<template>
  <header class="sticky top-0 z-50 bg-surface-elevated border-b border-slate-700 px-4 py-3 flex justify-between items-center">
    <router-link to="/sessions" class="text-lg font-bold text-amber-500">Fluxury</router-link>

    <nav class="flex gap-4">
      <router-link to="/beats" class="text-slate-400 hover:text-slate-100 text-sm transition-colors"
        active-class="text-slate-100 font-medium">Beats</router-link>
      <router-link to="/sessions" class="text-slate-400 hover:text-slate-100 text-sm transition-colors"
        active-class="text-slate-100 font-medium">Sessions</router-link>
    </nav>

    <div class="flex items-center gap-2">
      <button
          v-if="auth.user"
          @click="auth.logout"
          class="text-xs text-slate-400 hover:text-slate-100 transition-colors"
      >
        Logout
      </button>
      <router-link
          v-else
          to="/login"
          class="text-xs bg-amber-500 text-black px-3 py-1 rounded hover:bg-amber-400"
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
