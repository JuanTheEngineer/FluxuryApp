<script setup lang="ts">
import { Amplify } from 'aws-amplify'
import { Authenticator } from '@aws-amplify/ui-vue'
import '@aws-amplify/ui-vue/styles.css'
import awsExports from '../auth'

Amplify.configure(awsExports)

const formFields = {
  signIn: {
    username: {
      label: 'Email',
      placeholder: 'Enter your email',
      isRequired: true
    }
  }
}
</script>

<template>
  <authenticator :form-fields="formFields">
    <template v-slot:header>
      <div class="text-center py-4">
        <img
            src="https://docs.amplify.aws/assets/logo-dark.svg"
            alt="Amplify logo"
            class="w-24 mx-auto mb-2"
        />
        <h2 class="text-xl font-semibold">Welcome to Fluxury</h2>
      </div>
    </template>

    <template v-slot="{ user, signOut }">
      <div class="text-center py-8">
        <h1 class="text-xl">Hello {{ user.username }}!</h1>
        <button
            class="mt-4 bg-red-600 text-white px-4 py-2 rounded"
            @click="signOut"
        >
          Sign Out
        </button>
      </div>
    </template>
  </authenticator>
</template>
