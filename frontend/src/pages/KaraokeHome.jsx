import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

/** Página "Karaokê": escolha rápida do que tocar agora. */
export default function KaraokeHome() {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard').then((r) => r.data) })
  const { data: setlists } = useQuery({ queryKey: ['setlists'], queryFn: () => api.get('/setlists').then((r) => r.data) })
  return (
    <>
      <h1 className="page-title">Karaokê</h1>
      <div className="page-sub">Escolha uma música ou um setlist e suba no palco.</div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <h3 style={{ marginBottom: 10 }}>Continuar de onde parou</h3>
          {!data?.recent.length && <div className="empty">Toque uma música para ela aparecer aqui.</div>}
          {data?.recent.map((s) => (
            <Link key={s.slug} to={`/karaoke/${s.slug}`} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div><div className="title">{s.titulo}</div><div className="meta">{s.interprete}</div></div>
              <span className="chip">▶ tocar</span>
            </Link>
          ))}
        </div>
        <div className="card" style={{ flex: 1, minWidth: 300 }}>
          <h3 style={{ marginBottom: 10 }}>Setlists</h3>
          {!setlists?.length && <div className="empty">Nenhum setlist criado.</div>}
          {setlists?.map((s) => (
            <Link key={s.id} to={`/setlists/${s.id}`} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="title">{s.nome}</div>
              <span className="meta">{s.count} música(s)</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
