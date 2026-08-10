import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import Modal from './Modal'

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString()
}

function PasswordSection({ t }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')
  const [success, setSuccess] = useState(false)

  const save = useMutation({
    mutationFn: () => api.post('/me/password', { current_password: current, new_password: next }),
    onSuccess: () => { setSuccess(true); setCurrent(''); setNext(''); setConfirm('') },
    onError: () => setSuccess(false),
  })

  function submit(e) {
    e.preventDefault()
    setSuccess(false)
    if (next !== confirm) { setLocalError(t('password.mismatch')); return }
    setLocalError('')
    save.mutate()
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>{t('password.current')}</label>
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="field">
        <label>{t('password.new')}</label>
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} />
      </div>
      <div className="field">
        <label>{t('password.confirm')}</label>
        <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
      </div>
      {(localError || save.isError) && (
        <p className="error-text">{localError || save.error?.response?.data?.error || t('genericError')}</p>
      )}
      {success && <p style={{ color: 'var(--ok, #46c48a)', fontSize: 13, marginTop: 8 }}>{t('password.success')}</p>}
      <button type="submit" className="btn primary" disabled={save.isPending}>
        {save.isPending ? t('password.saving') : t('password.submit')}
      </button>
    </form>
  )
}

function EmailSection({ t, currentEmail }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [success, setSuccess] = useState(false)

  const save = useMutation({
    mutationFn: () => api.post('/me/email', { email, password }),
    onSuccess: () => { setSuccess(true); setEmail(''); setPassword(''); qc.invalidateQueries({ queryKey: ['me'] }) },
    onError: () => setSuccess(false),
  })

  function submit(e) {
    e.preventDefault()
    setSuccess(false)
    save.mutate()
  }

  return (
    <>
      <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>
        {t('email.current')}: {currentEmail || t('email.none')}
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label>{t('email.new')}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>{t('email.password')}</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {save.isError && <p className="error-text">{save.error?.response?.data?.error || t('genericError')}</p>}
        {success && <p style={{ color: 'var(--ok, #46c48a)', fontSize: 13, marginTop: 8 }}>{t('email.success')}</p>}
        <button type="submit" className="btn primary" disabled={save.isPending}>
          {save.isPending ? t('email.saving') : t('email.submit')}
        </button>
      </form>
    </>
  )
}

export default function ProfileModal({ onClose }) {
  const { t } = useTranslation('profileModal')
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get('/me').then((r) => r.data) })
  const { data: usage } = useQuery({ queryKey: ['quota-usage'], queryFn: () => api.get('/quota/usage').then((r) => r.data) })
  const { data: billing } = useQuery({ queryKey: ['billing-status'], queryFn: () => api.get('/billing/status').then((r) => r.data) })

  return (
    <Modal title={t('title')} onClose={onClose} maxWidth={560}>
      {!me ? <div className="empty">{t('loading')}</div> : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 12 }}>{t('sections.account')}</h3>
            <div className="field"><label>{t('fields.username')}</label><div>@{me.username}</div></div>
            <div className="field"><label>{t('fields.name')}</label><div>{me.name}</div></div>
            <div className="field"><label>{t('fields.memberSince')}</label><div>{formatDate(me.created_at)}</div></div>
            <div className="field"><label>{t('fields.lastLogin')}</label><div>{formatDate(me.last_login_at) || t('fields.never')}</div></div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>{t('fields.loginCount')}</label><div>{me.login_count}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 12 }}>{t('sections.security')}</h3>
            <PasswordSection t={t} />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 12 }}>{t('sections.email')}</h3>
            <EmailSection t={t} currentEmail={me.email} />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginBottom: 12 }}>{t('sections.plan')}</h3>
            <div className="field"><label>{t('plan.current')}</label><div>{billing?.plan_name || t('plan.none')}</div></div>
            {billing && (
              <div className="field"><label>Status</label><div>{t(`plan.status.${billing.subscription_status}`)}</div></div>
            )}
            {billing?.current_period_end && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{t('plan.nextBilling')}</label><div>{formatDate(billing.current_period_end)}</div>
              </div>
            )}
            <Link to="/planos" className="btn" onClick={onClose} style={{ marginTop: 8 }}>{t('plan.manage')}</Link>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h3 style={{ marginBottom: 12 }}>{t('sections.usage')}</h3>
            {usage?.setlists_max != null ? (
              <>
                <div className="field"><label>{t('usage.setlists')}</label><div>{usage.setlists_used} / {usage.setlists_max}</div></div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label>{t('usage.storage')}</label><div>{usage.storage_used_mb} / {usage.storage_limit_mb} MB</div>
                </div>
              </>
            ) : <div className="empty">{t('usage.unlimited')}</div>}
          </div>
        </>
      )}
    </Modal>
  )
}
