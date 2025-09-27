<template>
  <div class="min-h-screen flex flex-col bg-black text-white">
    <AppHeader />
    <main class="flex-1 overflow-y-auto">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from '@/components/AppHeader.vue'
</script>
