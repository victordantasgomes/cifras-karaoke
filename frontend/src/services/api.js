import axios from 'axios'
import { translateErrorCode } from '../i18n'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) useAuthStore.getState().logout()
    // Traduz `error` (texto em PT vindo da API) pelo `error_code` (ver
    // backend/utils/error_codes.py) antes de qualquer código do app ler
    // e.response.data.error — assim todo `catch` já existente ganha
    // tradução sem precisar mexer em cada um deles.
    const body = err.response?.data
    if (body?.error_code) body.error = translateErrorCode(body.error_code, body.error)
    return Promise.reject(err)
  },
)

export default api
