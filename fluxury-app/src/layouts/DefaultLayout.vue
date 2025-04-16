<script setup lang="ts">
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/ui-vue'
import { useAuthenticator } from '@aws-amplify/ui-vue'
import '@aws-amplify/ui-vue/styles.css'
import awsExports from '../auth'
import { watch } from 'vue'
import { useRouter } from 'vue-router'

Amplify.configure(awsExports)

const router = useRouter()
const { route } = useAuthenticator()

// Watch for login state changes
watch(route, (newState) => {
  if (newState === 'authenticated') {
    router.push('/sessions')
  }
})
</script>

<template>
  <authenticator />
</template>