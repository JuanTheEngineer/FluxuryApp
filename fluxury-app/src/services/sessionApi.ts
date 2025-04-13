import axios from 'axios'

const api = axios.create({
    baseURL: 'http://localhost:3001/api/sessions'
})

export const getSessions = async () => {
    const res = await api.get('/')
    return res.data
}

export const getSessionById = async (id: string) => {
    const res = await api.get(`/${id}`)
    return res.data
}

export const createSession = async () => {
    const res = await api.post('/')
    return res.data
}

export const saveSessionMetadata = async (session: any) => {
    return api.put(`/${session.id}/metadata`, session)
}

export const saveSessionScript = async (id: string, delta: any) => {
    return api.put(`/${id}/script`, delta)
}

export const getSessionScript = async (id: string) => {
    const res = await api.get(`/${id}/script`)
    return res.data
}
