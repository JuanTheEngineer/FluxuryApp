<template>
  <div class="p-4">
    <h1 class="text-xl">Add Beat</h1>
    <form @submit.prevent="submitBeat">
      <input v-model="url" placeholder="YouTube URL" class="border p-2 w-full" required />
      <button type="submit" class="mt-2 bg-blue-500 text-white p-2">Add Beat</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const url = ref('')

const submitBeat = () => {
  alert(`Beat URL submitted: ${url.value}`)
  url.value = ''
}

function pushBeatToPinia(url: string) {
  url
}
</script>
