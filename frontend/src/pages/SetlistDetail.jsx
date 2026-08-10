import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useDebounce } from '../hooks/useDebounce'
import { usePlaylistStore } from '../store/playlistStore'

export default function SetlistDetail() {
  const { t } = useTranslation('setlistDetail')
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const playlist = usePlaylistStore()
  const [items, setItems] = useState([])
  const [nome, setNome] = useState('')
  const [dragIdx, setDragIdx] = useState(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const dq = useDebounce(q)

  const { data } = useQuery({
    queryKey: ['setlist', id],
    queryFn: () => api.get(`/setlists/${id}`).then((r) => r.data),
  })
  useEffect(() => {
    if (data) { setItems(data.items); setNome(data.nome) }
  }, [data])

  const { data: results } = useQuery({
    queryKey: ['songs-pick', dq],
    queryFn: () => api.get('/songs', { params: { q: dq, page_size: 8 } }).then((r) => r.data),
    enabled: dq.length >= 2,
  })

  const save = useMutation({
    mutationFn: (next) => api.put(`/setlists/${id}`, { nome, items: next.map((i) => i.ref) }),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['setlist', id] }) },
    onError: (e) => {
      // a mudança local (setItems) já tinha sido aplicada de forma otimista —
      // se o servidor recusou (ex.: limite de armazenamento do plano), volta
      // pro último estado confirmado do servidor. Não dá pra confiar num
      // invalidate+refetch pra isso: quando o valor corrigido é IGUAL ao que
      // já estava em cache antes da tentativa otimista (o caso comum aqui —
      // a escrita foi rejeitada, então nada mudou no servidor), o
      // structuralSharing do React Query mantém a mesma referência de
      // `data`, o efeito que sincroniza items/nome não dispara de novo, e a
      // tela ficaria presa mostrando a mudança otimista como se tivesse
      // sido salva. `data` (do useQuery acima) sempre reflete o último GET
      // bem-sucedido — nunca é tocado por um PUT que falhou — por isso é
      // uma fonte confiável pra reverter direto, sem depender do efeito.
      setError(e.response?.data?.error || t('errors.save'))
      if (data) { setItems(data.items); setNome(data.nome) }
    },
  })

  // move um item de `from` para `to` — usado tanto pelos botões ▲▼ quanto pelo drag-and-drop
  const moveItem = (from, to) => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next)
    save.mutate(next)
  }

  // drag-and-drop nativo para reordenar (além dos botões ▲▼, mais confiáveis)
  const onDrop = (target) => {
    if (dragIdx !== null) moveItem(dragIdx, target)
    setDragIdx(null)
  }

  const addSong = (s) => {
    const next = [...items, { ref: `${s.interprete}/${s.titulo}`, song: s }]
    setItems(next); setQ(''); save.mutate(next)
  }
  const removeAt = (i) => {
    const next = items.filter((_, idx) => idx !== i)
    setItems(next); save.mutate(next)
  }

  // só músicas de fato linkadas (achadas no índice) entram na fila de reprodução
  const playableItems = items.filter((i) => i.song)
  const thisPlaylistActive = playlist.active && playlist.setlistId === id

  const playFrom = (playableIndex) => {
    playlist.start(id, nome, playableItems, playableIndex)
    navigate(`/karaoke/${playableItems[playableIndex].song.slug}`)
  }
  const resumePlaylist = () => {
    const song = playlist.queue[playlist.index]?.song
    if (song) navigate(`/karaoke/${song.slug}`)
  }

  if (!data) return <div className="empty">{t('loading')}</div>

  const isOwner = data.is_owner
  let playableIndex = -1

  return (
    <>
      {error && <div className="error-text no-print" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <div>
          {isOwner ? (
            <input className="input" style={{ fontSize: 22, fontWeight: 700, background: 'transparent', border: 'none', padding: 0 }}
              value={nome} title={t('renameHint')}
              onChange={(e) => setNome(e.target.value)}
              onBlur={() => { if (nome.trim()) save.mutate(items); else setNome(data.nome) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
                else if (e.key === 'Escape') { setNome(data.nome); e.target.blur() }
              }} />
          ) : (
            <div className="page-title" style={{ fontSize: 22 }}>{nome}</div>
          )}
          <div className="page-sub">
            {t('itemCount', { count: items.length })}
            {isOwner ? t('ownerHint') : t('readOnlyHint')}
          </div>
        </div>
        <button className="btn" onClick={() => window.print()}>{t('print')}</button>
      </div>

      <div className="row no-print" style={{ marginBottom: 16 }}>
        {thisPlaylistActive ? (
          <>
            <button className="btn primary" onClick={resumePlaylist}>
              {t('continuePlaylist', { current: playlist.index + 1, total: playlist.queue.length })}
            </button>
            <button className="btn danger" onClick={() => playlist.stop()}>{t('stopPlaylist')}</button>
          </>
        ) : (
          <button className="btn primary" disabled={!playableItems.length} onClick={() => playFrom(0)}>
            {t('playPlaylist', { count: playableItems.length })}
          </button>
        )}
      </div>

      {isOwner && (
        <div className="card no-print" style={{ marginBottom: 16 }}>
          <input className="input" placeholder={t('searchPlaceholder')} value={q}
            onChange={(e) => setQ(e.target.value)} />
          {dq.length >= 2 && results?.items.length === 0 && (
            <div className="empty" style={{ padding: '16px 0' }}>{t('searchEmpty', { query: dq })}</div>
          )}
          {results?.items.map((s) => (
            <div key={s.slug} className="song-row" style={{ gridTemplateColumns: '1fr auto' }}
              onClick={() => addSong(s)}>
              <div><span className="title">{s.titulo}</span> <span className="meta">— {s.interprete}</span></div>
              <span className="chip">{t('add')}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {items.length === 0 && <div className="empty">{t('empty')}</div>}
        {items.map((item, i) => {
          if (item.song) playableIndex += 1
          const myPlayableIndex = playableIndex
          return (
            <div key={item.ref + i} className="song-row" draggable={isOwner}
              style={{ gridTemplateColumns: '46px 1fr auto auto', opacity: dragIdx === i ? 0.4 : 1, cursor: isOwner ? 'grab' : 'default' }}
              onDragStart={() => isOwner && setDragIdx(i)}
              onDragOver={(e) => isOwner && e.preventDefault()}
              onDrop={() => isOwner && onDrop(i)}
              onDragEnd={() => setDragIdx(null)}>
              <div className="row no-print" style={{ flexDirection: 'column', gap: 2, flexWrap: 'nowrap' }}>
                {isOwner && (
                  <>
                    <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11, lineHeight: 1.4 }}
                      disabled={i === 0} title={t('moveUp')}
                      onClick={(e) => { e.stopPropagation(); moveItem(i, i - 1) }}>▲</button>
                    <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11, lineHeight: 1.4 }}
                      disabled={i === items.length - 1} title={t('moveDown')}
                      onClick={(e) => { e.stopPropagation(); moveItem(i, i + 1) }}>▼</button>
                  </>
                )}
              </div>
              <div>
                <div className="title">{i + 1}. {item.song?.titulo || item.ref}</div>
                <div className="meta">
                  {item.song?.interprete || ''} {item.song?.tom && <span className="chip">{item.song.tom}</span>}
                  {!item.song && <span className="chip" style={{ background: 'var(--danger)', color: '#fff' }}>{t('notFound')}</span>}
                </div>
              </div>
              {item.song && (
                <button className="btn" onClick={() => playFrom(myPlayableIndex)} title={t('playFromHere')}>▶</button>
              )}
              {isOwner && <button className="btn danger no-print" onClick={() => removeAt(i)}>×</button>}
            </div>
          )
        })}
      </div>
    </>
  )
}
