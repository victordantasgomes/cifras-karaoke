import { Navigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

function formatDuration(seconds, unavailableLabel) {
  if (!seconds) return unavailableLabel
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

function SongRankList({ items, suffix, valueKey, emptyLabel }) {
  if (!items?.length) return <div className="empty">{emptyLabel}</div>
  return items.map((s) => (
    <Link key={s.slug} to={`/musicas/${s.slug}`} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}>
      <div><div className="title">{s.titulo}</div><div className="meta">{s.interprete}</div></div>
      <span className="chip">{s[valueKey]} {suffix}</span>
    </Link>
  ))
}

function UserRankList({ items, suffix, valueKey, emptyLabel }) {
  if (!items?.length) return <div className="empty">{emptyLabel}</div>
  return items.map((u) => (
    <div key={u.username} className="song-row" style={{ gridTemplateColumns: '1fr auto', cursor: 'default' }}>
      <div><div className="title">{u.name}</div><div className="meta">@{u.username}</div></div>
      <span className="chip">{u[valueKey]} {suffix}</span>
    </div>
  ))
}

export default function AdminTools() {
  const { t } = useTranslation('adminTools')
  const user = useAuthStore((s) => s.user)
  const { data } = useQuery({
    queryKey: ['admin-stats-tools'],
    queryFn: () => api.get('/admin/stats/tools').then((r) => r.data),
    enabled: Boolean(user?.is_admin),
  })

  if (!user?.is_admin) return <Navigate to="/painel" replace />
  if (!data) return <div className="empty">{t('loading')}</div>

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>

      <div className="stat-grid">
        <div className="card stat"><div className="big">{data.total_users}</div><div className="label">{t('stats.users')}</div></div>
        <div className="card stat"><div className="big">{data.total_songs}</div><div className="label">{t('stats.songs')}</div></div>
        <div className="card stat">
          <div className="big">{formatDuration(data.avg_session_seconds, t('sessionUnavailable'))}</div>
          <div className="label">{t('stats.avgSession')}</div>
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.mostPlayed')}</h3>
          <SongRankList items={data.most_played} suffix={t('playsSuffix')} valueKey="count" emptyLabel={t('empty')} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.mostEdited')}</h3>
          <SongRankList items={data.most_edited} suffix={t('editsSuffix')} valueKey="edits" emptyLabel={t('empty')} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.mostSetlisted')}</h3>
          <SongRankList items={data.most_setlisted} suffix={t('setlistsSuffix')} valueKey="count" emptyLabel={t('empty')} />
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.topUploaders')}</h3>
          <UserRankList items={data.top_uploaders} suffix={t('songsSuffix')} valueKey="songs_count" emptyLabel={t('empty')} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.topByLogins')}</h3>
          <UserRankList items={data.top_by_logins} suffix={t('loginsSuffix')} valueKey="login_count" emptyLabel={t('empty')} />
        </div>
      </div>
    </>
  )
}
