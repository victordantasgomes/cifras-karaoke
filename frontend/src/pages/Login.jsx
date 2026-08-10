import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logoPrincipal from '../assets/logo-principal.png'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const { t } = useTranslation()
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
      navigate('/painel')
    } catch (e) {
      setError(e.response?.data?.error || t('login.genericError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <img src={logoPrincipal} alt="Banda do Zé" className="login-logo" />
        <div className="tag">{t('login.tagline')}</div>
        <div className="field">
          <label>{t('login.username')}</label>
          <input className="input" value={form.username} autoFocus
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>{t('login.password')}</label>
          <input className="input" type="password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        {error && <div className="error-text">{error}</div>}
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {t('login.submit')}
          </button>
        </div>
        <div className="page-sub" style={{ marginTop: 14 }}>
          {t('login.noAccount')} <Link to="/cadastro">{t('login.createAccount')}</Link>
        </div>
      </div>
    </div>
  )
}
