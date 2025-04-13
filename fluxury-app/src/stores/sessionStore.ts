import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
    state: () => ({
        sessions: [] as Session[],
        selectedSession: null as Session | null,
        isEditing: false
    }),
    actions: {
        setSessions(s: Session[]) {
            this.sessions = s
        },
        select(session: Session | null) {
            this.selectedSession = session
        },
        updateSelectedSession(data: Partial<Session>) {
            if (this.selectedSession) {
                this.selectedSession = { ...this.selectedSession, ...data }
            }
        }
    }
})

export interface Session {
    id: string
    name: string
    author: string
    beat: string
    script: string
    image: string
    created: string
    modified: string
}