import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

/** Página "Karaokê": escolha rápida do que tocar agora. */
export default function KaraokeHome() {
  const { t } = useTranslation('karaokeHome')
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard').then((r) => r.data) })
  const { data: setlists } = useQuery({ queryKey: ['setlists'], queryFn: () => api.get('/setlists').then((r) => r.data) })
  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <h3 style={{ marginBottom: 10 }}>{t('continueSection')}</h3>
          {!data?.recent.length && <div className="empty">{t('emptyRecent')}</div>}
          {data?.recent.map((s) => (
            <Link key={s.slug} to={`/karaoke/${s.slug}`} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div><div className="title">{s.titulo}</div><div className="meta">{s.interprete}</div></div>
              <span className="chip">{t('play')}</span>
            </Link>
          ))}
        </div>
        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <h3 style={{ marginBottom: 10 }}>{t('setlistsSection')}</h3>
          {!setlists?.length && <div className="empty">{t('emptySetlists')}</div>}
          {setlists?.map((s) => (
            <Link key={s.id} to={`/setlists/${s.id}`} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="title">{s.nome}</div>
              <span className="meta">{t('songCount', { count: s.count })}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
