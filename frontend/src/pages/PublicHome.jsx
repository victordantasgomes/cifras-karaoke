import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useDebounce } from '../hooks/useDebounce'
import VirtualList from '../components/VirtualList'
import PublicHeader from '../components/PublicHeader'
import '../styles/landing.css'

/**
 * Página principal (`/`) — funcional, sem login: busca/navega toda a
 * biblioteca compartilhada (`/public/songs`, `/public/songs/facets`, ver
 * plano). Modelada em Songs.jsx (mesmo padrão de busca+filtros+VirtualList),
 * mas sem os controles de escrita (importar/criar/apenas minhas) e sem
 * ownership: nada no resultado é privado, então não há chip de
 * "outro usuário"/"privada" pra mostrar. Usa o sistema de tema normal do
 * app (não força claro como a página de vendas em About.jsx).
 */
export default function PublicHome() {
  const { t } = useTranslation('publicHome')
  const { t: tSongs } = useTranslation('songs')
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState({ genero: '', interprete: '', tom: '' })
  const [page, setPage] = useState(1)
  const debouncedQ = useDebounce(q)
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['public-songs', debouncedQ, filters, page],
    queryFn: () => api.get('/public/songs', {
      params: { q: debouncedQ, ...filters, page, page_size: 200 },
    }).then((r) => r.data),
    keepPreviousData: true,
  })
  const { data: facets } = useQuery({
    queryKey: ['public-facets'],
    queryFn: () => api.get('/public/songs/facets').then((r) => r.data),
  })

  const items = data?.items || []

  return (
    <div className="landing-page">
      <PublicHeader />
      <main className="landing-container" style={{ paddingTop: 108, paddingBottom: 60, paddingLeft: '6vw', paddingRight: '6vw' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">{t('hero.title')}</h1>
          <div className="page-sub">{t('hero.subtitle')}</div>
          <Link to="/cadastro" className="btn primary" style={{ marginTop: 12, display: 'inline-block' }}>
            {t('hero.cta')}
          </Link>
        </div>

        <div className="row no-print" style={{ marginBottom: 16 }}>
          <input className="input" style={{ maxWidth: 320 }} placeholder={tSongs('searchPlaceholder')}
            value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
          <select className="input" style={{ maxWidth: 170 }} value={filters.genero}
            onChange={(e) => setFilters({ ...filters, genero: e.target.value })}>
            <option value="">{tSongs('allGenres')}</option>
            {facets?.generos.map((g) => <option key={g}>{g}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 190 }} value={filters.interprete}
            onChange={(e) => setFilters({ ...filters, interprete: e.target.value })}>
            <option value="">{tSongs('allArtists')}</option>
            {facets?.interpretes.map((g) => <option key={g}>{g}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 120 }} value={filters.tom}
            onChange={(e) => setFilters({ ...filters, tom: e.target.value })}>
            <option value="">{tSongs('key')}</option>
            {facets?.tons.map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>

        <div className="card" style={{ padding: 0 }}>
          {items.length === 0 && <div className="empty">{t('empty')}</div>}
          {items.length > 0 && (
            <VirtualList items={items} rowHeight={58} height={Math.min(640, items.length * 58)}
              renderRow={(s) => (
                <div key={s.slug} className="song-row" style={{ height: 58 }}
                  onClick={() => navigate(`/cifra/${s.slug}`)}>
                  <div>
                    <div className="title">{s.titulo}</div>
                    <div className="meta">{s.interprete}</div>
                  </div>
                  <div className="meta hide-sm">{s.genero}</div>
                  <div className="meta hide-sm">{s.tags.slice(0, 2).join(', ')}</div>
                  <div>{s.tom && <span className="chip">{s.tom}</span>}</div>
                  <button className="btn" style={{ padding: '5px 12px' }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/karaoke/${s.slug}`) }}>▶</button>
                </div>
              )} />
          )}
        </div>

        {data && data.total_pages > 1 && (
          <div className="row no-print" style={{ marginTop: 14, justifyContent: 'center' }}>
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tSongs('prevPage')}</button>
            <span className="meta" style={{ color: 'var(--muted)' }}>{tSongs('pageOf', { page: data.page, total: data.total_pages })}</span>
            <button className="btn" disabled={page >= data.total_pages} onClick={() => setPage(page + 1)}>{tSongs('nextPage')}</button>
          </div>
        )}
      </main>
    </div>
  )
}
