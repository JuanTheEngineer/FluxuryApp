import axios from 'axios'

const api = axios.create({
    baseURL: 'http://localhost:3001/api'
})

export const downloadBeat = (url: string, name?: string) =>
    api.post('/download', { url, name })

export const getBeats = () => api.get('/beats')
