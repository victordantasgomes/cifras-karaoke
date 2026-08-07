import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useDebounce } from '../hooks/useDebounce'
import VirtualList from '../components/VirtualList'

export default function Songs({ favoritesOnly = false }) {
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState({ genero: '', interprete: '', tom: '' })
  const [onlyMine, setOnlyMine] = useState(false)
  const [page, setPage] = useState(1)
  const [showUpload, setShowUpload] = useState(false)
  const debouncedQ = useDebounce(q)
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const { data } = useQuery({
    queryKey: ['songs', debouncedQ, filters, onlyMine, page, favoritesOnly],
    queryFn: () => api.get('/songs', {
      params: {
        q: debouncedQ, ...filters, page, page_size: 200,
        favoritas: favoritesOnly ? 1 : 0, only_mine: onlyMine ? 1 : 0,
      },
    }).then((r) => r.data),
    keepPreviousData: true,
  })
  const { data: facets } = useQuery({ queryKey: ['facets'], queryFn: () => api.get('/songs/facets').then((r) => r.data) })

  const items = data?.items || []

  return (
    <>
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">{favoritesOnly ? 'Favoritas' : 'Biblioteca'}</h1>
          <div className="page-sub">
            {data ? `${data.total} música(s)` : '…'}
            {!favoritesOnly && ' · de todos os usuários'}
          </div>
        </div>
        {!favoritesOnly && (
          <button className="btn primary" onClick={() => setShowUpload(!showUpload)}>+ Nova música</button>
        )}
      </div>

      {showUpload && <UploadCard onDone={() => setShowUpload(false)} />}

      <div className="row no-print" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Buscar por título, autor, intérprete, tag…"
          value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <select className="input" style={{ maxWidth: 170 }} value={filters.genero}
          onChange={(e) => setFilters({ ...filters, genero: e.target.value })}>
          <option value="">Todos os gêneros</option>
          {facets?.generos.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 190 }} value={filters.interprete}
          onChange={(e) => setFilters({ ...filters, interprete: e.target.value })}>
          <option value="">Todos os intérpretes</option>
          {facets?.interpretes.map((g) => <option key={g}>{g}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 120 }} value={filters.tom}
          onChange={(e) => setFilters({ ...filters, tom: e.target.value })}>
          <option value="">Tom</option>
          {facets?.tons.map((g) => <option key={g}>{g}</option>)}
        </select>
        {!favoritesOnly && (
          <label className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyMine}
              onChange={(e) => { setOnlyMine(e.target.checked); setPage(1) }} />
            Somente minhas
          </label>
        )}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 && <div className="empty">Nenhuma música encontrada. Envie um TXT para começar.</div>}
        {items.length > 0 && (
          <VirtualList items={items} rowHeight={58} height={Math.min(640, items.length * 58)}
            renderRow={(s) => (
              <div key={s.slug} className="song-row" style={{ height: 58 }}
                onClick={() => navigate(`/musicas/${s.slug}`)}>
                <div>
                  <div className="title">{s.favorita && <span className="fav-star">★ </span>}{s.titulo}</div>
                  <div className="meta">
                    {s.interprete}
                    {s.user_id && s.user_id !== user?.id && <span className="chip" style={{ marginLeft: 8 }} title="Você não criou esta música">de outro usuário</span>}
                    {s.user_id === user?.id && !s.shared && <span className="chip" style={{ marginLeft: 8 }} title="Só você vê esta música">🔒 privada</span>}
                  </div>
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
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Anterior</button>
          <span className="meta" style={{ color: 'var(--muted)' }}>página {data.page} de {data.total_pages}</span>
          <button className="btn" disabled={page >= data.total_pages} onClick={() => setPage(page + 1)}>Próxima →</button>
        </div>
      )}
    </>
  )
}

function UploadCard({ onDone }) {
  const [form, setForm] = useState({ titulo: '', genero: '', interprete: '' })
  const [file, setFile] = useState(null)
  const qc = useQueryClient()
  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('titulo', form.titulo)
      fd.append('genero', form.genero || 'Sem Gênero')
      fd.append('interprete', form.interprete || 'Desconhecido')
      return api.post('/songs', fd)
    },
    onSuccess: () => { qc.invalidateQueries(['songs']); qc.invalidateQueries(['facets']); onDone() },
  })
  return (
    <div className="card no-print" style={{ marginBottom: 18 }}>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>Arquivo TXT</label>
          <input className="input" type="file" accept=".txt" onChange={(e) => setFile(e.target.files[0])} />
        </div>
        <div className="field"><label>Gênero</label>
          <input className="input" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })} /></div>
        <div className="field"><label>Intérprete</label>
          <input className="input" value={form.interprete} onChange={(e) => setForm({ ...form, interprete: e.target.value })} /></div>
        <button className="btn primary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>Enviar</button>
      </div>
      {upload.isError && <div className="error-text">Falha no envio. Verifique o arquivo.</div>}
    </div>
  )
}
