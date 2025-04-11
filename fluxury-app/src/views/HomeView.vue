<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-cyan-950 text-slate-300 p-8">
    <img src="/public/apple-touch-icon.png" alt="Fluxury Logo" class="w-48 h-48 mb-6" />
    <h1 class="text-4xl font-extrabold mb-2 text-center tracking-wide">Welcome to Fluxury</h1>
    <p class="text-lg text-gray-300 mb-6 text-center max-w-xl">
      Capture your creative moments with precision. Manage, explore, and vibe to your beats — wherever inspiration strikes.
    </p>
    <router-link to="/beats" class="bg-blue-800 hover:bg-blue-500 text-white px-6 py-3 rounded text-lg font-semibold transition duration-150">
      View My Beats
    </router-link>
  </div>
</template>

<script setup>
// No script logic needed for static home
</script>

<style scoped>
</style>
