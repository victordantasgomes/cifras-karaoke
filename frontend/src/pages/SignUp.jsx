import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logoPrincipal from '../assets/logo-principal.png'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

/**
 * Cadastro público (Fase 5) — deliberadamente separado da criação de
 * usuário pelo admin (Settings.jsx::UserAdminCard): aqui não existe campo
 * de "administrador", e a conta nasce com biblioteca privada por padrão
 * (ver POST /api/auth/register). Login automático após o cadastro, mesmo
 * padrão de sessão do Login.jsx.
 */
export default function SignUp() {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)
  const navigate = useNavigate()

  const submit = async () => {
    setBusy(true); setError('')
    try {
      const { data } = await api.post('/auth/register', form)
      setSession(data.token, data.user)
      // Fases 6/7 (planos + Stripe) ainda não existem — quando existirem,
      // troca aqui pra redirecionar direto pra escolha de plano.
      navigate('/')
    } catch (e) {
      setError(e.response?.data?.error || 'Não foi possível criar sua conta.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <img src={logoPrincipal} alt="Banda do Zé" className="login-logo" />
        <div className="tag">Crie sua conta — sua biblioteca começa privada, só sua.</div>
        <div className="field">
          <label>Nome</label>
          <input className="input" value={form.name} autoFocus
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Usuário</label>
          <input className="input" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="field">
          <label>E-mail</label>
          <input className="input" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
            {busy ? 'Criando…' : 'Criar conta'}
          </button>
        </div>
        <div className="page-sub" style={{ marginTop: 14 }}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </div>
      </div>
    </div>
  )
}
