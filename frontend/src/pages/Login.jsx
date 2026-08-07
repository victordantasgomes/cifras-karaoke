import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logoPrincipal from '../assets/logo-principal.png'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)
  const navigate = useNavigate()

  const submit = async () => {
    setBusy(true); setError('')
    try {
      const { data } = await api.post('/auth/login', form)
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
        <img src={logoPrincipal} alt="Banda do Zé" className="login-logo" />
        <div className="tag">Suas cifras sincronizadas para o palco.</div>
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
            Entrar
          </button>
        </div>
        <div className="page-sub" style={{ marginTop: 14 }}>
          Não tem conta? <Link to="/cadastro">Criar conta</Link>
        </div>
      </div>
    </div>
  )
}
