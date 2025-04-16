import axios from 'axios'
import * as Amplify from 'aws-amplify'
const { Auth } = Amplify

const api = axios.create({
  baseURL: 'https://v54qeb9ih8.execute-api.us-east-1.amazonaws.com/test-invoke-stage/sessions' // 🔁 Replace with actual API URL
})

// Attach JWT token from Cognito to every request
async function authHeaders() {
  const session = await Auth.currentSession()
  const token = session.getIdToken().getJwtToken()
  return {
    headers: {
      Authorization: token
    }
  }
}

// CRUD API methods with JWT headers
export const getSessions = async () => {
  const config = await authHeaders()
  const res = await api.get('/', config)
  return res.data
}

export const getSessionById = async (id: string) => {
  const config = await authHeaders()
  const res = await api.get(`/${id}`, config)
  return res.data
}

export const createSession = async () => {
  const config = await authHeaders()
  const res = await api.post('/', {}, config)
  return res.data
}

export const saveSessionMetadata = async (session: any) => {
  const config = await authHeaders()
  return api.put(`/${session.id}/metadata`, session, config)
}

export const saveSessionScript = async (id: string, delta: any) => {
  const config = await authHeaders()
  return api.put(`/${id}/script`, delta, config)
}

export const getSessionScript = async (id: string) => {
  const config = await authHeaders()
  const res = await api.get(`/${id}/script`, config)
  return res.data
}
