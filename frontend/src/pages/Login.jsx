import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '', name: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)
  const navigate = useNavigate()

  const submit = async () => {
    setBusy(true); setError('')
    try {
      const url = mode === 'login' ? '/auth/login' : '/auth/register'
      const { data } = await api.post(url, form)
      setSession(data.token, data.user)
      navigate('/')
    } catch (e) {
      setError(e.response?.data?.error || 'Não foi possível conectar ao servidor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>CIFRAS <em style={{ color: 'var(--amber)', fontStyle: 'normal' }}>KARAOKÊ</em></h1>
        <div className="tag">Suas cifras sincronizadas para o palco.</div>
        {mode === 'register' && (
          <div className="field">
            <label>Nome</label>
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
        )}
        <div className="field">
          <label>Usuário</label>
          <input className="input" value={form.username} autoFocus
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>Senha</label>
          <input className="input" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
          <button className="btn ghost"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Criar conta' : 'Já tenho conta'}
          </button>
        </div>
      </div>
    </div>
  )
}
