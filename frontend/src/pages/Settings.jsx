import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '../i18n'
import { useChangeLocale } from '../hooks/useLocale'
import { ACCENTS, DEFAULT_ACCENT, DEFAULT_THEME, THEMES, useChangeTheme } from '../hooks/useTheme'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

const COLOR_FIELD_KEYS = ['sweepSung', 'sweepUpcoming', 'amber', 'sample', 'ok']

// espelha services/settings_service.py::DEFAULT_COLORS — usado só pelo
// botão "Restaurar padrão" (não precisa ir ao servidor pra isso)
const DEFAULT_COLORS = {
  sweepSung: '#f2b544',
  sweepUpcoming: '#ffffff',
  amber: '#f2b544',
  sample: '#6fa8ff',
  ok: '#46c48a',
}

function ColorSettingsCard() {
  const { t } = useTranslation('settings')
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [colors, setColors] = useState(null)
  useEffect(() => { if (data?.colors && !colors) setColors(data.colors) }, [data]) // eslint-disable-line

  const save = useMutation({
    mutationFn: (next) => api.put('/settings', { colors: next }).then((r) => r.data),
    onSuccess: (d) => { setColors(d.colors); qc.setQueryData(['settings'], d) },
  })

  const restoreDefaults = () => setColors(DEFAULT_COLORS)

  if (!colors) return null

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('color.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('color.description')}
      </p>
      <div className="row" style={{ gap: 20, marginBottom: 14 }}>
        {COLOR_FIELD_KEYS.map((key) => (
          <div key={key} style={{ textAlign: 'center' }}>
            <input type="color" value={colors[key] || '#000000'}
              style={{ width: 46, height: 34, padding: 0, border: '1px solid var(--stroke)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
              onChange={(e) => setColors({ ...colors, [key]: e.target.value })} />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, maxWidth: 100 }}>{t(`color.fields.${key}`)}</div>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate(colors)}>
          {save.isPending ? t('color.saving') : t('color.save')}
        </button>
        <button className="btn" onClick={restoreDefaults}>{t('color.restoreDefault')}</button>
      </div>
    </div>
  )
}

const LOGO_VARIANTS = ['black', 'white', 'color_light', 'color_dark']

function LogoVariantSlot({ t, user, variant, uploaded, onChanged }) {
  const [file, setFile] = useState(null)

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('variant', variant)
      return api.post('/branding/logo', fd)
    },
    onSuccess: () => { setFile(null); onChanged() },
  })
  const remove = useMutation({
    mutationFn: () => api.delete(`/branding/logo/${variant}`),
    onSuccess: onChanged,
  })

  return (
    <div style={{ border: '1px solid var(--stroke)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t(`branding.variants.${variant}`)}</div>
      <div className="row" style={{ marginBottom: 10, alignItems: 'center', minHeight: 48 }}>
        {uploaded ? (
          <img src={`/api/branding/${user.id}/logo?variant=${variant}`} alt="" style={{ height: 48, borderRadius: 8 }} />
        ) : (
          <span className="page-sub" style={{ margin: 0 }}>{t('branding.noLogo')}</span>
        )}
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input className="input" type="file" accept="image/*" style={{ maxWidth: 180 }}
          onChange={(e) => setFile(e.target.files[0])} />
        <button className="btn primary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
          {upload.isPending ? t('branding.uploading') : t('branding.uploadLogo')}
        </button>
        {uploaded && (
          <button className="btn danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {remove.isPending ? t('branding.removing') : t('branding.removeLogo')}
          </button>
        )}
      </div>
    </div>
  )
}

function BrandingSettingsCard() {
  const { t } = useTranslation('settings')
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const { data: variants } = useQuery({
    queryKey: ['branding-variants', user?.id],
    queryFn: () => api.get('/branding/logo/variants').then((r) => r.data),
    enabled: Boolean(user?.id),
  })
  const [bandName, setBandName] = useState(null)
  useEffect(() => { if (data && bandName === null) setBandName(data.prefs?.bandName || '') }, [data]) // eslint-disable-line

  const saveBandName = useMutation({
    mutationFn: () => api.put('/settings', { prefs: { ...data?.prefs, bandName } }).then((r) => r.data),
    onSuccess: (d) => qc.setQueryData(['settings'], d),
  })

  if (bandName === null) return null

  const invalidateVariants = () => qc.invalidateQueries({ queryKey: ['branding-variants', user?.id] })

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('branding.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('branding.description')}</p>
      <div className="field">
        <label>{t('branding.bandNameLabel')}</label>
        <input className="input" style={{ maxWidth: 320 }} value={bandName}
          placeholder={t('branding.bandNamePlaceholder')}
          onChange={(e) => setBandName(e.target.value)} />
      </div>
      <div className="row" style={{ marginBottom: 18 }}>
        <button className="btn primary" disabled={saveBandName.isPending} onClick={() => saveBandName.mutate()}>
          {saveBandName.isPending ? t('branding.saving') : t('branding.save')}
        </button>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('branding.logoLabel')}</label>
        <p style={{ color: 'var(--muted)', margin: '0 0 12px', fontSize: 13 }}>{t('branding.logoHint')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {LOGO_VARIANTS.map((variant) => (
            <LogoVariantSlot key={variant} t={t} user={user} variant={variant}
              uploaded={Boolean(variants?.includes(variant))} onChanged={invalidateVariants} />
          ))}
        </div>
      </div>
    </div>
  )
}

function LanguageSettingsCard() {
  const { t, i18n } = useTranslation()
  const changeLocale = useChangeLocale()
  const [busy, setBusy] = useState(false)

  const onChange = async (e) => {
    setBusy(true)
    try {
      await changeLocale(e.target.value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('language.label')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('language.description')}</p>
      <select className="input" style={{ maxWidth: 260 }} value={i18n.language} disabled={busy} onChange={onChange}>
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>{LOCALE_LABELS[locale]}</option>
        ))}
      </select>
    </div>
  )
}

// espelha as cores definidas em styles/global.css (:root[data-accent="..."])
// — só pra desenhar as amostras clicáveis, a cor de verdade vem da variável CSS
const ACCENT_SWATCHES = {
  azul: '#5b87ff',
  vermelho: '#ef5a4a',
  verde: '#4cc48a',
  rosa: '#f4739a',
  lilas: '#a78bfa',
  preto: '#d9d6cc',
  branco: '#f2f0e9',
  cinza: '#a39d8f',
  amarelo: '#ffb000',
}

function ThemeSettingsCard() {
  const { t } = useTranslation('settings')
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const changeTheme = useChangeTheme()
  const theme = data?.prefs?.theme || DEFAULT_THEME
  const accent = data?.prefs?.accentColor || DEFAULT_ACCENT

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('appearance.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('appearance.description')}</p>
      <div className="field">
        <label>{t('appearance.theme')}</label>
        <div className="row">
          {THEMES.map((th) => (
            <button key={th} type="button" className={`btn ${theme === th ? 'primary' : ''}`}
              onClick={() => changeTheme({ theme: th })}>
              {t(`appearance.themes.${th}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>{t('appearance.accent')}</label>
        <div className="row" style={{ gap: 10 }}>
          {ACCENTS.map((a) => (
            <button key={a} type="button" onClick={() => changeTheme({ accentColor: a })}
              title={t(`appearance.accents.${a}`)} aria-label={t(`appearance.accents.${a}`)}
              style={{
                width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', padding: 0,
                background: ACCENT_SWATCHES[a],
                border: accent === a ? '3px solid var(--text)' : '1px solid var(--stroke)',
              }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PedalSettingsCard() {
  const { t } = useTranslation('settings')
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const config = data?.prefs?.pedalConfig
  const buttonCount = config?.buttons?.length || 0
  const comboCount = config?.assignments?.filter((a) => a.buttonIds.length >= 2).length || 0

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('pedal.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('pedal.description')}
      </p>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <span>
          {buttonCount
            ? t('pedal.summary', { count: buttonCount, combos: comboCount })
            : t('pedal.summaryEmpty')}
        </span>
        <Link className="btn primary" to="/pedal">{t('pedal.configure')}</Link>
      </div>
    </div>
  )
}

function BillingCard() {
  const { t, i18n } = useTranslation('settings')
  const { data: status } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then((r) => r.data),
  })
  const { data: usage } = useQuery({
    queryKey: ['quota-usage'],
    queryFn: () => api.get('/quota/usage').then((r) => r.data),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const abrirPortal = async () => {
    setBusy(true); setError('')
    try {
      const return_url = window.location.origin + '/configuracoes'
      const { data } = await api.get('/billing/portal-session', { params: { return_url } })
      window.location.href = data.url
    } catch (e) {
      setError(e.response?.data?.error || t('billing.portalError'))
      setBusy(false)
    }
  }

  if (!status) return null

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('billing.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('billing.status')} <strong>{t(`subscriptionStatus.${status.subscription_status}`, status.subscription_status)}</strong>
        {status.plan_name && <> · {t('billing.plan')} <strong>{status.plan_name}</strong></>}
        {status.current_period_end && <> · {t('billing.renewsOn', { date: new Date(status.current_period_end).toLocaleDateString(i18n.language) })}</>}
      </p>
      {usage?.setlists_max != null && (
        <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
          {t('billing.usage', { used: usage.setlists_used, max: usage.setlists_max, storageUsed: usage.storage_used_mb, storageMax: usage.storage_limit_mb })}
        </p>
      )}
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="row" style={{ gap: 8 }}>
        {status.subscription_status === 'none' ? (
          <Link className="btn primary" to="/planos">{t('billing.viewPlans')}</Link>
        ) : (
          <button className="btn" disabled={busy} onClick={abrirPortal}>
            {busy ? t('billing.opening') : t('billing.manage')}
          </button>
        )}
      </div>
    </div>
  )
}

function UserRow({ u, isSelf }) {
  const { t, i18n } = useTranslation('settings')
  const qc = useQueryClient()
  const [resetting, setResetting] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [rowError, setRowError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] })

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/users/${u.id}`),
    onSuccess: invalidate,
    onError: (e) => setRowError(e.response?.data?.error || t('userAdmin.deleteUserError')),
  })

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/admin/users/${u.id}/reset-password`, { password: newPassword }),
    onSuccess: () => { setResetting(false); setNewPassword(''); setRowError('') },
    onError: (e) => setRowError(e.response?.data?.error || t('userAdmin.resetPasswordError')),
  })

  const setCategory = useMutation({
    mutationFn: (category) => api.put(`/admin/users/${u.id}/plan-category`, { category }),
    onSuccess: invalidate,
    onError: (e) => setRowError(e.response?.data?.error || t('userAdmin.setCategoryError')),
  })

  // Categoria administrativa (Convidado/Administrador, ver schema.sql::plans
  // kind) — não é a mesma coisa que um plano pago de verdade (plan_name,
  // via plan_id) nem que uma conta legada sem categoria nenhuma atribuída
  // (plan_grandfathered=true, sem plano) — ver AuthService.set_plan_category.
  const category = u.is_admin ? 'admin' : u.plan_name ? 'paid' : u.plan_grandfathered ? 'legacy' : 'guest'
  const categoryLabel = category === 'paid'
    ? t('userAdmin.categoryPaid', { name: u.plan_name })
    : t(`userAdmin.category${category === 'admin' ? 'Admin' : category === 'legacy' ? 'Legacy' : 'Guest'}`)
  const selectValue = category === 'admin' || category === 'guest' ? category : ''

  const changeCategory = (newCategory) => {
    if (!newCategory || newCategory === selectValue) return
    const label = t(`userAdmin.category${newCategory === 'admin' ? 'Admin' : 'Guest'}`)
    if (confirm(t('userAdmin.setCategoryConfirm', { username: u.username, category: label }))) {
      setCategory.mutate(newCategory)
    }
  }

  return (
    <li style={{ padding: '10px 0', borderBottom: '1px solid var(--stroke)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          {u.name} <span style={{ color: 'var(--muted)' }}>@{u.username}</span>
          {u.is_admin && <span className="tag" style={{ marginLeft: 8 }}>admin</span>}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => { setResetting(!resetting); setRowError('') }}>
            {t('userAdmin.resetPassword')}
          </button>
          {!isSelf && (
            <button className="btn danger" disabled={remove.isPending}
              onClick={() => confirm(t('userAdmin.confirmDelete', { username: u.username })) && remove.mutate()}>
              {remove.isPending ? t('userAdmin.deleting') : t('userAdmin.delete')}
            </button>
          )}
        </div>
      </div>
      <div className="page-sub" style={{ marginTop: 4 }}>
        {t('userAdmin.accessCount', { count: u.login_count })} · {t('userAdmin.lastLogin', { date: u.last_login_at ? new Date(u.last_login_at).toLocaleString(i18n.language) : t('userAdmin.never') })}
        {' · '}{t('userAdmin.setlistsCount', { count: u.setlists_count })} · {t('userAdmin.favoritesCount', { count: u.favorites_count })}
      </div>
      <div className="row" style={{ marginTop: 6, gap: 8, alignItems: 'center' }}>
        <span className="page-sub" style={{ margin: 0 }}>{t('userAdmin.category')}: {categoryLabel}</span>
        {!isSelf && (
          <select className="input" style={{ width: 'auto' }} value={selectValue} disabled={setCategory.isPending}
            onChange={(e) => changeCategory(e.target.value)}>
            <option value="" disabled>{t('userAdmin.categorySelectPlaceholder')}</option>
            <option value="guest">{t('userAdmin.categoryGuest')}</option>
            <option value="admin">{t('userAdmin.categoryAdmin')}</option>
          </select>
        )}
      </div>
      {resetting && (
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <input className="input" type="password" placeholder={t('userAdmin.newPasswordPlaceholder')}
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button className="btn primary" disabled={!newPassword || resetPassword.isPending}
            onClick={() => resetPassword.mutate()}>
            {resetPassword.isPending ? t('userAdmin.saving') : t('userAdmin.confirm')}
          </button>
        </div>
      )}
      {rowError && <div className="error-text" style={{ marginTop: 6 }}>{rowError}</div>}
    </li>
  )
}

function PlanRow({ plan }) {
  const { t } = useTranslation('settings')
  const qc = useQueryClient()
  const [maxSetlists, setMaxSetlists] = useState(plan.max_setlists)
  const [storageLimitMb, setStorageLimitMb] = useState(plan.storage_limit_mb)
  const [priceReais, setPriceReais] = useState((plan.price_cents / 100).toFixed(2))
  const [error, setError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-plans'] })

  const save = useMutation({
    mutationFn: () => api.put(`/admin/plans/${plan.id}`, {
      max_setlists: Number(maxSetlists),
      storage_limit_mb: Number(storageLimitMb),
      price_cents: Math.round(Number(priceReais) * 100),
    }),
    onSuccess: () => { invalidate(); setError('') },
    onError: (e) => setError(e.response?.data?.error || t('plansAdmin.saveError')),
  })

  const toggleActive = useMutation({
    mutationFn: () => api.post(`/admin/plans/${plan.id}/active`, { value: !plan.active }),
    onSuccess: invalidate,
  })

  // recria o Product+Price na Stripe (conta/modo atualmente configurado em
  // STRIPE_SECRET_KEY) e reaponta o plano — pra planos criados sem Stripe
  // habilitada, ou pra rebindar depois de trocar de conta/modo (ex.: test
  // -> live, ver plans_service.py::resync_stripe). Sempre cria um Product
  // novo, por isso o confirm().
  const resyncStripe = useMutation({
    mutationFn: () => api.post(`/admin/plans/${plan.id}/resync-stripe`),
    onSuccess: () => { invalidate(); setError('') },
    onError: (e) => setError(e.response?.data?.error || t('plansAdmin.resyncError')),
  })

  return (
    <li style={{ padding: '10px 0', borderBottom: '1px solid var(--stroke)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>
          {plan.name}
          {!plan.active && <span className="tag" style={{ marginLeft: 8 }}>{t('plansAdmin.archived')}</span>}
          {!plan.stripe_price_id && <span className="tag" style={{ marginLeft: 8 }} title={t('plansAdmin.notSyncedTitle')}>{t('plansAdmin.notSynced')}</span>}
        </strong>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" disabled={resyncStripe.isPending}
            title={t('plansAdmin.resyncTitle')}
            onClick={() => confirm(t('plansAdmin.resyncConfirm')) && resyncStripe.mutate()}>
            {resyncStripe.isPending ? t('plansAdmin.resyncing') : t('plansAdmin.resync')}
          </button>
          <button className="btn" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate()}>
            {plan.active ? t('plansAdmin.archive') : t('plansAdmin.reactivate')}
          </button>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>{t('plansAdmin.setlistsMax')}</label>
          <input className="input" type="number" min="0" value={maxSetlists}
            onChange={(e) => setMaxSetlists(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 160 }}>
          <label>{t('plansAdmin.storageMb')}</label>
          <input className="input" type="number" min="0" value={storageLimitMb}
            onChange={(e) => setStorageLimitMb(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>{t('plansAdmin.priceMonthly')}</label>
          <input className="input" type="number" min="0" step="0.01" value={priceReais}
            onChange={(e) => setPriceReais(e.target.value)} />
        </div>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('plansAdmin.saving') : t('plansAdmin.save')}
        </button>
      </div>
      {error && <div className="error-text" style={{ marginTop: 6 }}>{error}</div>}
    </li>
  )
}

/** Convidado/Administrador (kind !== 'paid', ver schema.sql::plans) —
 * categorias singleton, sempre gratuitas: só setlists/armazenamento são
 * editáveis aqui, sem preço, sem arquivar, sem Stripe (reaproveita o mesmo
 * PUT /admin/plans/<id> do plano pago — price_cents fica travado em 0 pelo
 * próprio backend pra essas linhas, ver PlansService.update). */
function SpecialPlanRow({ plan }) {
  const { t } = useTranslation('settings')
  const qc = useQueryClient()
  const [maxSetlists, setMaxSetlists] = useState(plan.max_setlists)
  const [storageLimitMb, setStorageLimitMb] = useState(plan.storage_limit_mb)
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () => api.put(`/admin/plans/${plan.id}`, {
      max_setlists: Number(maxSetlists),
      storage_limit_mb: Number(storageLimitMb),
      price_cents: 0,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-plans'] }); setError('') },
    onError: (e) => setError(e.response?.data?.error || t('plansAdmin.saveError')),
  })

  return (
    <li style={{ padding: '10px 0', borderBottom: '1px solid var(--stroke)' }}>
      <strong>{plan.name}</strong>
      <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>{t('plansAdmin.setlistsMax')}</label>
          <input className="input" type="number" min="0" value={maxSetlists}
            onChange={(e) => setMaxSetlists(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 160 }}>
          <label>{t('plansAdmin.storageMb')}</label>
          <input className="input" type="number" min="0" value={storageLimitMb}
            onChange={(e) => setStorageLimitMb(e.target.value)} />
        </div>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('plansAdmin.saving') : t('plansAdmin.save')}
        </button>
      </div>
      {error && <div className="error-text" style={{ marginTop: 6 }}>{error}</div>}
    </li>
  )
}

function PlansAdminCard() {
  const { t } = useTranslation('settings')
  const qc = useQueryClient()
  const { data: plans } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/admin/plans').then((r) => r.data),
  })
  const [form, setForm] = useState({ name: '', max_setlists: '', storage_limit_mb: '', price_reais: '' })
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: () => api.post('/admin/plans', {
      name: form.name,
      max_setlists: Number(form.max_setlists),
      storage_limit_mb: Number(form.storage_limit_mb),
      price_cents: Math.round(Number(form.price_reais || 0) * 100),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plans'] })
      setForm({ name: '', max_setlists: '', storage_limit_mb: '', price_reais: '' })
      setError('')
    },
    onError: (e) => setError(e.response?.data?.error || t('plansAdmin.createPlanError')),
  })

  const specialPlans = plans?.filter((p) => p.kind !== 'paid') || []
  const paidPlans = plans?.filter((p) => p.kind === 'paid') || []

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('plansAdmin.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('plansAdmin.description')}
      </p>

      {specialPlans.length > 0 && (
        <>
          <h4 style={{ marginBottom: 4 }}>{t('plansAdmin.specialTitle')}</h4>
          <p style={{ color: 'var(--muted)', margin: '0 0 10px', fontSize: 13 }}>
            {t('plansAdmin.specialDescription')}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
            {specialPlans.map((p) => <SpecialPlanRow key={p.id} plan={p} />)}
          </ul>
        </>
      )}

      {paidPlans.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
          {paidPlans.map((p) => <PlanRow key={p.id} plan={p} />)}
        </ul>
      )}

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="field">
          <label>{t('plansAdmin.name')}</label>
          <input className="input" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('plansAdmin.namePlaceholder')} />
        </div>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>{t('plansAdmin.setlistsMax')}</label>
          <input className="input" type="number" min="0" value={form.max_setlists}
            onChange={(e) => setForm({ ...form, max_setlists: e.target.value })} />
        </div>
        <div className="field" style={{ maxWidth: 160 }}>
          <label>{t('plansAdmin.storageMb')}</label>
          <input className="input" type="number" min="0" value={form.storage_limit_mb}
            onChange={(e) => setForm({ ...form, storage_limit_mb: e.target.value })} />
        </div>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>{t('plansAdmin.priceMonthly')}</label>
          <input className="input" type="number" min="0" step="0.01" value={form.price_reais}
            onChange={(e) => setForm({ ...form, price_reais: e.target.value })} />
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        <button className="btn primary" disabled={create.isPending || !form.name} onClick={() => create.mutate()}>
          {create.isPending ? t('plansAdmin.creating') : t('plansAdmin.createPlan')}
        </button>
      </div>
    </div>
  )
}

function UserAdminCard() {
  const { t } = useTranslation('settings')
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then((r) => r.data),
  })
  const [form, setForm] = useState({ username: '', password: '', name: '', is_admin: false })
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: (payload) => api.post('/admin/users', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setForm({ username: '', password: '', name: '', is_admin: false })
      setError('')
    },
    onError: (e) => setError(e.response?.data?.error || t('userAdmin.createUserError')),
  })

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('userAdmin.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('userAdmin.description')}
      </p>

      {users?.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
          {users.map((u) => <UserRow key={u.id} u={u} isSelf={u.id === currentUser?.id} />)}
        </ul>
      )}

      <div className="field">
        <label>{t('userAdmin.name')}</label>
        <input className="input" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="field">
        <label>{t('userAdmin.username')}</label>
        <input className="input" value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })} />
      </div>
      <div className="field">
        <label>{t('userAdmin.password')}</label>
        <input className="input" type="password" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </div>
      <label className="row" style={{ gap: 8, alignItems: 'center', margin: '4px 0 14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_admin}
          onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
        {t('userAdmin.admin')}
      </label>
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        <button className="btn primary" disabled={create.isPending} onClick={() => create.mutate(form)}>
          {create.isPending ? t('userAdmin.creating') : t('userAdmin.createUser')}
        </button>
      </div>
    </div>
  )
}

function NormalizeLibraryCard() {
  const { t } = useTranslation('settings')
  const qc = useQueryClient()
  const { data: status } = useQuery({
    queryKey: ['admin-normalize-status'],
    queryFn: () => api.get('/admin/songs/normalize-status').then((r) => r.data),
  })
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [total, setTotal] = useState(null)
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  useEffect(() => {
    if (status && remaining === null) { setRemaining(status.remaining); setTotal(status.remaining) }
  }, [status]) // eslint-disable-line

  const start = async () => {
    stopRef.current = false
    setRunning(true)
    setError('')
    // se for a primeira leva desde que a página carregou, o total da barra
    // é o "remaining" atual — retomar depois de parar não reinicia a barra
    let baseTotal = total ?? remaining
    if (baseTotal === null) baseTotal = 0
    try {
      while (!stopRef.current) {
        const { data } = await api.post('/admin/songs/normalize-batch', { limit: 50 })
        setRemaining(data.remaining)
        if (data.remaining > baseTotal) { baseTotal = data.remaining; setTotal(baseTotal) }
        if (data.processed === 0 || data.remaining === 0) break
      }
    } catch (e) {
      setError(e.response?.data?.error || t('normalizeLibrary.error'))
    } finally {
      setRunning(false)
      qc.invalidateQueries({ queryKey: ['songs'] })
      qc.invalidateQueries({ queryKey: ['facets'] })
    }
  }
  const stop = () => { stopRef.current = true }

  const reprocessAll = useMutation({
    mutationFn: () => api.post('/admin/songs/normalize-reset'),
    onSuccess: (r) => { setTotal(r.data.remaining); setRemaining(r.data.remaining); setError('') },
    onError: (e) => setError(e.response?.data?.error || t('normalizeLibrary.error')),
  })

  const percent = total ? Math.round(((total - (remaining ?? total)) / total) * 100) : 0

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('normalizeLibrary.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('normalizeLibrary.description')}
      </p>
      {remaining !== null && (
        <>
          <div style={{ background: 'var(--stroke)', borderRadius: 8, height: 10, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} />
          </div>
          <div className="page-sub" style={{ marginBottom: 14 }}>
            {remaining === 0 ? t('normalizeLibrary.allNormalized') : t('normalizeLibrary.remainingOfTotal', { count: remaining, total })}
          </div>
        </>
      )}
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        {running ? (
          <button className="btn danger" onClick={stop}>{t('normalizeLibrary.stop')}</button>
        ) : (
          <button className="btn primary" disabled={remaining === 0} onClick={start}>{t('normalizeLibrary.start')}</button>
        )}
        {!running && remaining === 0 && (
          <button className="btn" disabled={reprocessAll.isPending}
            onClick={() => { if (window.confirm(t('normalizeLibrary.reprocessAllConfirm'))) reprocessAll.mutate() }}>
            {reprocessAll.isPending ? t('normalizeLibrary.reprocessing') : t('normalizeLibrary.reprocessAll')}
          </button>
        )}
      </div>
    </div>
  )
}

/** Detecta músicas com o mesmo nome (intérprete + título) e letra muito
 * parecida, etiquetando cada uma como "Versão 1", "Versão 2"... (@versao no
 * cabeçalho — ver SongsService.duplicate_versions_scan). Diferente de
 * NormalizeLibraryCard: não precisa de barra de progresso em lote — o
 * agrupamento em si já é rápido (só compara músicas que já compartilham
 * nome, não a biblioteca inteira par a par), então é um botão só, com o
 * resultado mostrado depois de rodar. Passa a rodar sozinho daqui pra
 * frente também, sempre que uma música nova colidir com uma existente
 * (ver SongsService._check_duplicate_versions) — este botão é só pra
 * resolver o que já existia antes dessa checagem existir. */
function DuplicateVersionsCard() {
  const { t } = useTranslation('settings')
  const qc = useQueryClient()
  const { data: status } = useQuery({
    queryKey: ['admin-duplicate-versions-status'],
    queryFn: () => api.get('/admin/songs/duplicate-versions-status').then((r) => r.data),
  })
  const [error, setError] = useState('')

  const scan = useMutation({
    mutationFn: () => api.post('/admin/songs/duplicate-versions-scan').then((r) => r.data),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['admin-duplicate-versions-status'] }) },
    onError: (e) => setError(e.response?.data?.error || t('duplicateVersions.error')),
  })

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('duplicateVersions.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('duplicateVersions.description')}
      </p>
      {status && (
        <div className="page-sub" style={{ marginBottom: 14 }}>
          {status.pending_groups === 0
            ? t('duplicateVersions.none')
            : t('duplicateVersions.pendingGroups', { count: status.pending_groups })}
        </div>
      )}
      {scan.isSuccess && (
        <div className="page-sub" style={{ marginBottom: 14 }}>
          {t('duplicateVersions.result', { groups: scan.data.groups_found, songs: scan.data.songs_labeled })}
        </div>
      )}
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="row">
        <button className="btn primary" disabled={scan.isPending} onClick={() => scan.mutate()}>
          {scan.isPending ? t('duplicateVersions.scanning') : t('duplicateVersions.scan')}
        </button>
      </div>
    </div>
  )
}

/** Preenche @youtube_url em lote via busca real na API do YouTube (ver
 * YoutubeService) — prioriza músicas que estão em algum setlist (pedido do
 * usuário: são as músicas realmente em uso). Mesmo padrão de barra de
 * progresso/Start-Stop de NormalizeLibraryCard, mas com lotes menores — a
 * cota gratuita da API é limitada (~100 buscas/dia); estourar a cota
 * devolve um erro que já para o laço sozinho (mesmo catch de sempre). */
function YoutubeLinkCard() {
  const { t } = useTranslation('settings')
  const { data: status } = useQuery({
    queryKey: ['admin-youtube-link-status'],
    queryFn: () => api.get('/admin/songs/youtube-link-status').then((r) => r.data),
  })
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [remainingInSetlists, setRemainingInSetlists] = useState(null)
  const [found, setFound] = useState(0)
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  useEffect(() => {
    if (status && remaining === null) {
      setRemaining(status.remaining)
      setRemainingInSetlists(status.remaining_in_setlists)
    }
  }, [status]) // eslint-disable-line

  const start = async () => {
    stopRef.current = false
    setRunning(true)
    setError('')
    setFound(0)
    let foundTotal = 0
    try {
      while (!stopRef.current) {
        const { data } = await api.post('/admin/songs/youtube-link-batch', { limit: 10 })
        setRemaining(data.remaining)
        setRemainingInSetlists(data.remaining_in_setlists)
        foundTotal += data.found
        setFound(foundTotal)
        if (data.processed === 0 || data.remaining === 0) break
      }
    } catch (e) {
      setError(e.response?.data?.error || t('youtubeLink.error'))
    } finally {
      setRunning(false)
    }
  }
  const stop = () => { stopRef.current = true }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('youtubeLink.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('youtubeLink.description')}
      </p>
      {remaining !== null && (
        <div className="page-sub" style={{ marginBottom: 14 }}>
          {remaining === 0
            ? t('youtubeLink.allFilled')
            : t('youtubeLink.remaining', { count: remaining, inSetlists: remainingInSetlists })}
          {found > 0 && <> · {t('youtubeLink.foundSoFar', { count: found })}</>}
        </div>
      )}
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="row">
        {running ? (
          <button className="btn danger" onClick={stop}>{t('youtubeLink.stop')}</button>
        ) : (
          <button className="btn primary" disabled={remaining === 0} onClick={start}>{t('youtubeLink.start')}</button>
        )}
      </div>
    </div>
  )
}

function StorageRecomputeCard() {
  const { t } = useTranslation('settings')
  const { data: status } = useQuery({
    queryKey: ['admin-storage-recompute-status'],
    queryFn: () => api.get('/admin/storage/recompute-status').then((r) => r.data),
  })
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [total, setTotal] = useState(null)
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  useEffect(() => {
    if (status && remaining === null) { setRemaining(status.remaining); setTotal(status.remaining) }
  }, [status]) // eslint-disable-line

  const start = async () => {
    stopRef.current = false
    setRunning(true)
    setError('')
    let baseTotal = total ?? remaining
    if (baseTotal === null) baseTotal = 0
    try {
      while (!stopRef.current) {
        const { data } = await api.post('/admin/storage/recompute-batch', { limit: 50 })
        setRemaining(data.remaining)
        if (data.remaining > baseTotal) { baseTotal = data.remaining; setTotal(baseTotal) }
        if (data.processed === 0 || data.remaining === 0) break
      }
    } catch (e) {
      setError(e.response?.data?.error || t('storageRecompute.error'))
    } finally {
      setRunning(false)
    }
  }
  const stop = () => { stopRef.current = true }

  const percent = total ? Math.round(((total - (remaining ?? total)) / total) * 100) : 0

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>{t('storageRecompute.title')}</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        {t('storageRecompute.description')}
      </p>
      {remaining !== null && (
        <>
          <div style={{ background: 'var(--stroke)', borderRadius: 8, height: 10, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} />
          </div>
          <div className="page-sub" style={{ marginBottom: 14 }}>
            {remaining === 0 ? t('storageRecompute.allDone') : t('storageRecompute.remainingOfTotal', { count: remaining, total })}
          </div>
        </>
      )}
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        {running ? (
          <button className="btn danger" onClick={stop}>{t('storageRecompute.stop')}</button>
        ) : (
          <button className="btn primary" disabled={remaining === 0} onClick={start}>{t('storageRecompute.start')}</button>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const { t } = useTranslation('settings')
  const user = useAuthStore((s) => s.user)
  return (
    <>
      <h1 className="page-title">{t('pageTitle')}</h1>
      <div className="page-sub">{t('pageSub')}</div>
      <LanguageSettingsCard />
      <ThemeSettingsCard />
      <ColorSettingsCard />
      <BrandingSettingsCard />
      <PedalSettingsCard />
      <BillingCard />
      {user?.is_admin && <UserAdminCard />}
      {user?.is_admin && <PlansAdminCard />}
      {user?.is_admin && <NormalizeLibraryCard />}
      {user?.is_admin && <DuplicateVersionsCard />}
      {user?.is_admin && <YoutubeLinkCard />}
      {user?.is_admin && <StorageRecomputeCard />}
    </>
  )
}
