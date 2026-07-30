import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../services/api'

function SongLinks({ items, extra }) {
  if (!items?.length) return <div className="empty">Nada por aqui ainda.</div>
  return items.map((s) => (
    <Link key={s.slug} to={`/musicas/${s.slug}`} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}>
      <div><div className="title">{s.titulo}</div><div className="meta">{s.interprete}</div></div>
      {extra && <span className="chip">{extra(s)}</span>}
    </Link>
  ))
}

export default function Dashboard() {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard').then((r) => r.data) })
  if (!data) return <div className="empty">Carregando…</div>
  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <div className="page-sub">Visão geral do seu repertório.</div>
      <div className="stat-grid">
        <div className="card stat"><div className="big">{data.total_songs}</div><div className="label">Músicas</div></div>
        <div className="card stat"><div className="big">{data.total_setlists}</div><div className="label">Setlists</div></div>
        <div className="card stat"><div className="big">{data.favorites.length}</div><div className="label">Favoritas</div></div>
        <div className="card stat"><div className="big">{data.most_played.length}</div><div className="label">No radar</div></div>
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>Mais tocadas</h3>
          <SongLinks items={data.most_played} extra={(s) => `${s.plays}×`} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>Últimos acessos</h3>
          <SongLinks items={data.recent} />
        </div>
        <div className="card" style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 10 }}>Favoritas</h3>
          <SongLinks items={data.favorites} extra={() => '★'} />
        </div>
      </div>
    </>
  )
}
