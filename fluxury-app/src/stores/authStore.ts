import { defineStore } from 'pinia'
import * as Amplify from 'aws-amplify'
const { Auth } = Amplify

export const useAuthStore = defineStore('auth', {
    state: () => ({
        user: null as any,
        jwt: ''
    }),
    actions: {
        async login(email: string, password: string) {
            const user = await Auth.signIn(email, password)
            this.user = user
            const session = await Auth.currentSession()
            this.jwt = session.getIdToken().getJwtToken()
        },
        async logout() {
            await Auth.signOut()
            this.user = null
            this.jwt = ''
        },
        async loadSession() {
            try {
                const session = await Auth.currentSession()
                this.jwt = session.getIdToken().getJwtToken()
                this.user = await Auth.currentAuthenticatedUser()
            } catch {
                this.user = null
                this.jwt = ''
            }
        }
    }
})