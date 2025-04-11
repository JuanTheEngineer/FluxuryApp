<template>
  <div class="p-4">
    <h1 class="text-xl">Beat Browser</h1>
    <ul>
      <li v-for="beat in beats" :key="beat.id" class="my-2">
        {{ beat.name }}
        <audio :src="beat.url" controls></audio>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { useBeatStore } from '../stores/beatStore'
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'

const beatStore = useBeatStore()
const { beats } = storeToRefs(beatStore)

onMounted(() => {
  beatStore.fetchBeats()
})
</script>
