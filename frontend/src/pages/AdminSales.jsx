import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

const STATUS_ORDER = ['trialing', 'active', 'past_due', 'canceled', 'none']

function StatusBreakdown({ byStatus, t }) {
  const entries = STATUS_ORDER.filter((s) => byStatus[s]).map((s) => [s, byStatus[s]])
  if (!entries.length) return <div className="empty">{t('empty')}</div>
  return (
    <div className="row" style={{ gap: 8 }}>
      {entries.map(([status, count]) => (
        <span key={status} className="chip">{t(`status.${status}`)}: {count}</span>
      ))}
    </div>
  )
}

function PlanBreakdown({ items, suffix, emptyLabel }) {
  if (!items?.length) return <div className="empty">{emptyLabel}</div>
  return items.map((p) => (
    <div key={p.name} className="song-row" style={{ gridTemplateColumns: '1fr auto', cursor: 'default' }}>
      <div className="title">{p.name}</div>
      <span className="chip">{p.n} {suffix}</span>
    </div>
  ))
}

function CancellationTrend({ data, emptyLabel }) {
  if (!data?.length) return <div className="empty">{emptyLabel}</div>
  const max = Math.max(...data.map((d) => d.count), 1)
  return data.map((d) => (
    <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ width: 92, fontSize: 12.5, color: 'var(--muted)', flexShrink: 0 }}>{d.day}</span>
      <div style={{ flex: 1, background: 'var(--glass-strong)', borderRadius: 4, height: 10 }}>
        <div style={{
          width: `${(d.count / max) * 100}%`, background: 'var(--accent)',
          height: '100%', borderRadius: 4, minWidth: 4,
        }} />
      </div>
      <span className="chip">{d.count}</span>
    </div>
  ))
}

export default function AdminSales() {
  const { t } = useTranslation('adminSales')
  const user = useAuthStore((s) => s.user)
  const { data } = useQuery({
    queryKey: ['admin-stats-sales'],
    queryFn: () => api.get('/admin/stats/sales').then((r) => r.data),
    enabled: Boolean(user?.is_admin),
  })

  if (!user?.is_admin) return <Navigate to="/painel" replace />
  if (!data) return <div className="empty">{t('loading')}</div>

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>

      <div className="stat-grid">
        <div className="card stat"><div className="big">{data.active_subscriptions}</div><div className="label">{t('stats.activeSubscriptions')}</div></div>
        <div className="card stat"><div className="big">{data.landing_views}</div><div className="label">{t('stats.landingViews')}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginBottom: 10 }}>{t('sections.byStatus')}</h3>
        <StatusBreakdown byStatus={data.by_status} t={t} />
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.byPlan')}</h3>
          <PlanBreakdown items={data.by_plan} suffix={t('subscribersSuffix')} emptyLabel={t('empty')} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 6 }}>{t('sections.cancellationTrend')}</h3>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 12 }}>{t('trendHint')}</p>
          <CancellationTrend data={data.cancellations_by_day} emptyLabel={t('empty')} />
        </div>
      </div>
    </>
  )
}
