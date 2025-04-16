<template>
  <div
    class="flex flex-col items-center justify-center min-h-screen p-8 text-center space-y-6 bg-gray-100"
  >
    <img src="/logo.svg" alt="Fluxury Logo" class="w-48 h-48" />
    <h1 class="text-3xl font-bold">Welcome to Fluxury</h1>
    <div class="space-x-4">
      <RouterLink
        to="/sessions"
        class="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
      >
        Start Session
      </RouterLink>
      <RouterLink to="/beats" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
        View My Beats
      </RouterLink>
    </div>
  </div>
</template>
