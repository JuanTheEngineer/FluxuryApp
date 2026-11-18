<template>
  <div class="min-h-screen flex flex-col bg-surface text-slate-100 font-sans">
    <AppHeader />
    <main class="flex-1 overflow-y-auto">
      <!-- Keyed by path: /session/a -> /session/b mounts a fresh editor (it
           loads its session on mount). Query-only changes keep the view. -->
      <RouterView :key="$route.path" />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
</script>
