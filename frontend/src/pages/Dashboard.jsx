import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

function SongLinks({ items, extra, emptyLabel }) {
  if (!items?.length) return <div className="empty">{emptyLabel}</div>
  return items.map((s) => (
    <Link key={s.slug} to={`/musicas/${s.slug}`} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}>
      <div><div className="title">{s.titulo}</div><div className="meta">{s.interprete}</div></div>
      {extra && <span className="chip">{extra(s)}</span>}
    </Link>
  ))
}

function ArtistLinks({ items, emptyLabel }) {
  if (!items?.length) return <div className="empty">{emptyLabel}</div>
  return items.map((a) => (
    <div key={a.interprete} className="song-row" style={{ gridTemplateColumns: '1fr auto', cursor: 'default' }}>
      <div className="title">{a.interprete}</div>
      <span className="chip">{a.plays}×</span>
    </div>
  ))
}

function FavoriteArtistsGenresCard() {
  const { t } = useTranslation('dashboard')
  const { data } = useQuery({ queryKey: ['favorites'], queryFn: () => api.get('/favorites').then((r) => r.data) })
  const artists = data?.artists || []
  const genres = data?.genres || []

  return (
    <div className="card" style={{ flex: 1, minWidth: 280 }}>
      <h3 style={{ marginBottom: 10 }}>{t('sections.yourFavorites')}</h3>
      {artists.length === 0 && genres.length === 0 ? (
        <div className="empty">
          {t('noFavoritesHint')}
          <div style={{ marginTop: 10 }}>
            <Link to="/favoritas" className="btn">{t('goToFavorites')}</Link>
          </div>
        </div>
      ) : (
        <div className="row" style={{ gap: 8 }}>
          {artists.map((a) => <span key={a} className="chip">{a}</span>)}
          {genres.map((g) => <span key={g} className="chip">{g}</span>)}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { t } = useTranslation('dashboard')
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard').then((r) => r.data) })
  if (!data) return <div className="empty">{t('loading')}</div>
  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>
      <div className="stat-grid">
        <div className="card stat"><div className="big">{data.total_songs}</div><div className="label">{t('stats.songs')}</div></div>
        <div className="card stat"><div className="big">{data.total_setlists}</div><div className="label">{t('stats.setlists')}</div></div>
        <div className="card stat"><div className="big">{data.favorites.length}</div><div className="label">{t('stats.favorites')}</div></div>
        <div className="card stat"><div className="big">{data.most_played.length}</div><div className="label">{t('stats.radar')}</div></div>
      </div>
      <div className="row" style={{ alignItems: 'stretch', marginBottom: 22 }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.mostPlayed')}</h3>
          <SongLinks items={data.most_played} extra={(s) => `${s.plays}×`} emptyLabel={t('empty')} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.recent')}</h3>
          <SongLinks items={data.recent} emptyLabel={t('empty')} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.favorites')}</h3>
          <SongLinks items={data.favorites} extra={() => '★'} emptyLabel={t('empty')} />
        </div>
      </div>
      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.mostPlayedArtists')}</h3>
          <ArtistLinks items={data.most_played_artists} emptyLabel={t('emptyArtists')} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>{t('sections.newlyAdded')}</h3>
          <SongLinks items={data.newly_added} emptyLabel={t('empty')} />
        </div>
        <FavoriteArtistsGenresCard />
      </div>
    </>
  )
}
