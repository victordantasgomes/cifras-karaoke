import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import InstrumentPicker from '../components/InstrumentPicker'
import logo from '../assets/logo-tumtumpa-login.png'

/**
 * Cadastro público (Fase 5) — deliberadamente separado da criação de
 * usuário pelo admin (Settings.jsx::UserAdminCard): aqui não existe campo
 * de "administrador", e a conta nasce com biblioteca privada por padrão
 * (ver POST /api/auth/register). Login automático após o cadastro, mesmo
 * padrão de sessão do Login.jsx, seguido de redirecionamento pra escolha
 * de plano (Fase 7 — Pricing.jsx).
 */
export default function SignUp() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', city: '', instruments: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)
  const navigate = useNavigate()

  const submit = async () => {
    setBusy(true); setError('')
    try {
      const { data } = await api.post('/auth/register', form)
      setSession(data.token, data.user)
      navigate('/planos')
    } catch (e) {
      setError(e.response?.data?.error || t('signup.genericError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <img src={logo} alt="TumTumPa" className="login-logo" />
        <div className="tag">{t('signup.tagline')}</div>
        <div className="field">
          <label>{t('signup.name')}</label>
          <input className="input" value={form.name} autoFocus
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('signup.username')}</label>
          <input className="input" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('signup.email')}</label>
          <input className="input" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('signup.password')}</label>
          <input className="input" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>{t('signup.city')}</label>
          <input className="input" value={form.city} placeholder={t('signup.cityPlaceholder')}
            onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t('signup.instruments')}</label>
          <InstrumentPicker value={form.instruments} onChange={(instruments) => setForm({ ...form, instruments })} />
        </div>
        {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? t('signup.submitting') : t('signup.submit')}
          </button>
        </div>
        <div className="page-sub" style={{ marginTop: 14 }}>
          {t('signup.hasAccount')} <Link to="/login">{t('signup.login')}</Link>
        </div>
      </div>
    </div>
  )
}
