import axios from 'axios'

const api = axios.create({
    baseURL: 'http://localhost:3001/api'
})

export const downloadBeat = (url: string) => api.post('/download', { url })
export const getBeats = () => api.get('/beats')
