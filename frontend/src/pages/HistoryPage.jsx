import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

export default function HistoryPage() {
  const { data } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard').then((r) => r.data) })
  return (
    <>
      <h1 className="page-title">Histórico</h1>
      <div className="page-sub">Execuções recentes no player karaokê.</div>
      <div className="card" style={{ padding: 0 }}>
        {!data?.recent.length && <div className="empty">Ainda não há execuções registradas.</div>}
        {data?.recent.map((s) => (
          <Link key={s.slug} to={`/musicas/${s.slug}`} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}>
            <div><div className="title">{s.titulo}</div><div className="meta">{s.interprete}</div></div>
            <span className="meta">{s.last ? new Date(s.last).toLocaleString('pt-BR') : ''}</span>
          </Link>
        ))}
      </div>
    </>
  )
}
