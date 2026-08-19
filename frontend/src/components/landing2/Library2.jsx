import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../services/api'
import { useDebounce } from '../../hooks/useDebounce'
import VirtualList from '../VirtualList'

/** "Sua biblioteca" de /sobre2 — biblioteca pública real (GET /public/songs
 * + /public/songs/facets), com chips de gênero clicáveis em vez de
 * <select>, pra bater com o layout da referência. Sem fabricar nome/data de
 * show específico (a referência mostra isso) — usa um rótulo genérico. */
export default function Library2({ page }) {
  const { t } = useTranslation('landing2')
  const [q, setQ] = useState('')
  const [genero, setGenero] = useState('')
  const debouncedQ = useDebounce(q)
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['landing2-library', debouncedQ, genero],
    queryFn: () => api.get('/public/songs', {
      params: { q: debouncedQ, genero, page_size: 200 },
    }).then((r) => r.data),
    keepPreviousData: true,
  })
  const { data: facets } = useQuery({
    queryKey: ['public-facets'],
    queryFn: () => api.get('/public/songs/facets').then((r) => r.data),
  })

  const items = data?.items || []
  const generos = facets?.generos || []

  return (
    <section id="biblioteca">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t(`${page}.library.title`)}</h2>
          <p className="landing-section-sub">{t(`${page}.library.subtitle`)}</p>
        </div>

        <div className="landing-library-count">
          {t(`${page}.library.count`, { count: data?.total ?? 0 })}
        </div>

        <div className="landing-library-search">
          <span aria-hidden="true">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t(`${page}.library.searchPlaceholder`)} />
        </div>

        <div className="landing-library-chip-row">
          <button type="button" className={`landing-library-chip${genero === '' ? ' active' : ''}`}
            onClick={() => setGenero('')}>{t(`${page}.library.allChip`)}</button>
          {generos.map((g) => (
            <button key={g} type="button" className={`landing-library-chip${genero === g ? ' active' : ''}`}
              onClick={() => setGenero(g)}>{g}</button>
          ))}
        </div>

        <div className="landing-library-group-label">{t(`${page}.library.groupLabel`)}</div>

        <div className="card" style={{ padding: 0 }}>
          {items.length === 0 && <div className="empty">{t(`${page}.library.count`, { count: 0 })}</div>}
          {items.length > 0 && (
            <VirtualList items={items} rowHeight={58} height={Math.min(500, items.length * 58)}
              renderRow={(s, i) => (
                <div key={s.slug} className="song-row" style={{ height: 58 }}
                  onClick={() => navigate(`/cifra/${s.slug}`)}>
                  <div>
                    <div className="title">{String(i + 1).padStart(2, '0')} · {s.titulo}</div>
                    <div className="meta">{s.interprete} · {s.genero}</div>
                  </div>
                  <div>{s.tom && <span className="chip">{s.tom}</span>}</div>
                </div>
              )} />
          )}
        </div>

        <div className="landing-library-add-cta">
          <a href="/cadastro" className="btn">{t(`${page}.library.addCta`)}</a>
        </div>
      </div>
    </section>
  )
}
