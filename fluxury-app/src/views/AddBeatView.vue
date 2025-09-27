<template>
  <div class="p-4 max-w-md mx-auto">
    <h1 class="text-xl font-bold mb-4">Add Beat</h1>
    <form @submit.prevent="submitBeat">
      <input
          v-model="url"
          placeholder="YouTube URL"
          class="border border-gray-300 rounded p-2 w-full mb-2"
          required
      />
      <input
          v-model="name"
          placeholder="Beat Name"
          class="border border-gray-300 rounded p-2 w-full mb-2"
          required
      />
      <input
          v-model="creator"
          placeholder="Creator Name"
          class="border border-gray-300 rounded p-2 w-full mb-2"
          required
      />
      <button
          type="submit"
          class="bg-blue-600 hover:bg-blue-700 text-white rounded p-2 w-full"
          :disabled="isSaving"
      >
        {{ isSaving ? 'Saving...' : 'Add Beat' }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { beatsApi } from '@/api/api-clients'
import type { CreateBeatRequestContent } from '@/api/open-api/beat-client'

const url = ref('')
const name = ref('')
const creator = ref('')
const isSaving = ref(false)

const submitBeat = async () => {
  isSaving.value = true
  try {
    const payload: CreateBeatRequestContent = {
      url: url.value,
      name: name.value,
      creator: creator.value,
    }
    await beatsApi.createBeat(payload)
    alert('Beat successfully added!')
    url.value = ''
    name.value = ''
    creator.value = ''
  } catch (err) {
    console.error(err)
    alert('Failed to add beat.')
  } finally {
    isSaving.value = false
  }
}
</script>
