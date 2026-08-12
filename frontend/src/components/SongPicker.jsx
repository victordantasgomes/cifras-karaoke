import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useDebounce } from '../hooks/useDebounce'

/** Busca de músicas com filtro de gênero/artista e seleção múltipla —
 * reaproveitado no painel inline da lista de setlists (Setlists.jsx) e
 * na tela de detalhe do setlist (SetlistDetail.jsx). `namespace` escolhe
 * de qual arquivo de tradução puxar as strings (cada tela já tem o seu,
 * com as mesmas chaves: searchPlaceholder/searchEmpty/allGenres/
 * allArtists/addSelected/adding). */
export default function SongPicker({ namespace, onAdd, pending }) {
  const { t } = useTranslation(namespace)
  const [q, setQ] = useState('')
  const [genero, setGenero] = useState('')
  const [interprete, setInterprete] = useState('')
  const [selected, setSelected] = useState({}) // slug -> song
  const dq = useDebounce(q)

  const { data: facets } = useQuery({ queryKey: ['facets'], queryFn: () => api.get('/songs/facets').then((r) => r.data) })
  const active = dq.length >= 2 || !!genero || !!interprete
  const { data: results } = useQuery({
    queryKey: ['songs-pick', dq, genero, interprete],
    queryFn: () => api.get('/songs', { params: { q: dq, genero, interprete, page_size: 40 } }).then((r) => r.data),
    enabled: active,
  })

  const toggle = (s) => setSelected((prev) => {
    const next = { ...prev }
    if (next[s.slug]) delete next[s.slug]; else next[s.slug] = s
    return next
  })
  const selectedList = Object.values(selected)

  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder={t('searchPlaceholder')}
          value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 170 }} value={genero} onChange={(e) => setGenero(e.target.value)}>
          <option value="">{t('allGenres')}</option>
          {facets?.generos.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 190 }} value={interprete} onChange={(e) => setInterprete(e.target.value)}>
          <option value="">{t('allArtists')}</option>
          {facets?.interpretes.map((g) => <option key={g}>{g}</option>)}
        </select>
      </div>

      {active && results?.items.length === 0 && (
        <div className="empty" style={{ padding: '16px 0' }}>{t('searchEmpty', { query: dq })}</div>
      )}
      {active && results?.items.length > 0 && (
        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--stroke)', borderRadius: 10, marginBottom: 10 }}>
          {results.items.map((s) => (
            <label key={s.slug} className="song-row" style={{ gridTemplateColumns: '24px 1fr auto', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!selected[s.slug]} onChange={() => toggle(s)} />
              <div><span className="title">{s.titulo}</span> <span className="meta">— {s.interprete}</span></div>
              {s.tom && <span className="chip">{s.tom}</span>}
            </label>
          ))}
        </div>
      )}

      <button className="btn primary" disabled={!selectedList.length || pending}
        onClick={() => { onAdd(selectedList); setSelected({}) }}>
        {pending ? t('adding') : t('addSelected', { count: selectedList.length })}
      </button>
    </div>
  )
}
