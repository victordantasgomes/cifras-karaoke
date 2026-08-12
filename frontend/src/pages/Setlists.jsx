import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import SongPicker from '../components/SongPicker'

export default function Setlists() {
  const { t } = useTranslation('setlists')
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [addingTo, setAddingTo] = useState(null) // id do setlist com o painel de "+ Adicionar música" aberto
  const { data } = useQuery({ queryKey: ['setlists'], queryFn: () => api.get('/setlists').then((r) => r.data) })

  const create = useMutation({
    mutationFn: () => api.post('/setlists', { nome: name, items: [] }),
    onSuccess: () => { setName(''); setError(''); qc.invalidateQueries({ queryKey: ['setlists'] }) },
    onError: (e) => setError(e.response?.data?.error || t('errors.create')),
  })
  const importFile = useMutation({
    mutationFn: (file) => {
      const fd = new FormData(); fd.append('file', file)
      return api.post('/setlists/import', fd)
    },
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['setlists'] }) },
    onError: (e) => setError(e.response?.data?.error || t('errors.import')),
  })
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/setlists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setlists'] }),
  })
  const toggleShare = useMutation({
    mutationFn: ({ id, value }) => api.post(`/setlists/${id}/share`, { value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setlists'] }),
  })
  // clonar: qualquer setlist visível (próprio ou compartilhado por outro
  // usuário) vira uma cópia própria e editável — ver setlist_service.py::clone.
  const clone = useMutation({
    mutationFn: (id) => api.post(`/setlists/${id}/clone`),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['setlists'] }) },
    onError: (e) => setError(e.response?.data?.error || t('errors.clone')),
  })
  // deixar de seguir: só afeta a lista de QUEM PEDIU, não mexe no setlist
  // nem em quem mais o segue — ver setlist_service.py::unfollow.
  const unfollow = useMutation({
    mutationFn: (id) => api.post(`/setlists/${id}/unfollow`),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['setlists'] }) },
    onError: (e) => setError(e.response?.data?.error || t('errors.unfollow')),
  })

  const exportSetlist = async (id) => {
    const { data: blob } = await api.get(`/setlists/${id}/export`, { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${id}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  const mine = data?.filter((s) => s.is_owner) || []
  const following = data?.filter((s) => !s.is_owner) || []

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>
      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="row no-print" style={{ marginBottom: 18 }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder={t('newPlaceholder')}
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name && create.mutate()} />
        <button className="btn primary" disabled={!name} onClick={() => create.mutate()}>{t('create')}</button>
        <label className="btn">
          {t('importTxt')}
          <input type="file" accept=".txt" hidden
            onChange={(e) => e.target.files[0] && importFile.mutate(e.target.files[0])} />
        </label>
      </div>

      <h2 className="section-heading">{t('myLists')}</h2>
      <div className="card" style={{ padding: 0, marginBottom: 28 }}>
        {!mine.length && <div className="empty">{t('emptyMine')}</div>}
        {mine.map((s) => (
          <div key={s.id}>
            <div className="song-row" style={{ gridTemplateColumns: '1fr auto auto auto auto auto' }}>
              <Link to={`/setlists/${s.id}`}>
                <div className="title">{s.nome}</div>
                <div className="meta">{t('itemCount', { count: s.count })}</div>
              </Link>
              <label className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={s.shared}
                  onChange={(e) => toggleShare.mutate({ id: s.id, value: e.target.checked })} />
                {t('shared')}
              </label>
              <button className="btn no-print" title={t('addSongTitle')}
                onClick={() => setAddingTo(addingTo === s.id ? null : s.id)}>
                {addingTo === s.id ? t('close') : t('addSong')}
              </button>
              <button className="btn no-print" disabled={clone.isPending} onClick={() => clone.mutate(s.id)}>
                {clone.isPending ? t('cloning') : t('clone')}
              </button>
              <a className="btn" href="#" onClick={(e) => { e.preventDefault(); exportSetlist(s.id) }}>{t('export')}</a>
              <button className="btn danger no-print"
                onClick={() => confirm(t('deleteConfirm')) && remove.mutate(s.id)}>{t('delete')}</button>
            </div>
            {addingTo === s.id && <AddSongPanel setlistId={s.id} onAdded={() => setAddingTo(null)} />}
          </div>
        ))}
      </div>

      <h2 className="section-heading">{t('followingLists')}</h2>
      <div className="card" style={{ padding: 0 }}>
        {!following.length && <div className="empty">{t('emptyFollowing')}</div>}
        {following.map((s) => (
          <div key={s.id} className="song-row" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
            <Link to={`/setlists/${s.id}`}>
              <div className="title">{s.nome}</div>
              <div className="meta">{t('itemCount', { count: s.count })}</div>
            </Link>
            <button className="btn no-print" disabled={clone.isPending} onClick={() => clone.mutate(s.id)}>
              {clone.isPending ? t('cloning') : t('clone')}
            </button>
            <a className="btn" href="#" onClick={(e) => { e.preventDefault(); exportSetlist(s.id) }}>{t('export')}</a>
            <button className="btn danger no-print" disabled={unfollow.isPending}
              onClick={() => unfollow.mutate(s.id)}>
              {unfollow.isPending ? t('unfollowing') : t('unfollow')}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

/** Painel inline de busca+adicionar, aberto por baixo da linha do setlist
 * (sem precisar navegar até a tela de detalhe) — mesmo padrão de busca já
 * usado em SetlistDetail.jsx, só que direcionado a UM setlist específico
 * a partir da lista. Busca os itens atuais só ao abrir (não vem na listagem,
 * que só traz a contagem) pra poder acrescentar sem apagar o resto. */
function AddSongPanel({ setlistId, onAdded }) {
  const { t } = useTranslation('setlists')
  const qc = useQueryClient()
  const [error, setError] = useState('')

  const { data: setlist } = useQuery({
    queryKey: ['setlist', setlistId],
    queryFn: () => api.get(`/setlists/${setlistId}`).then((r) => r.data),
  })

  const addSongs = useMutation({
    mutationFn: (songsToAdd) => {
      const newRefs = songsToAdd.map((s) => `${s.interprete}/${s.titulo}`)
      const refs = [...(setlist?.items || []).map((i) => i.ref), ...newRefs]
      return api.put(`/setlists/${setlistId}`, { nome: setlist.nome, items: refs })
    },
    onSuccess: () => {
      setError('')
      qc.invalidateQueries({ queryKey: ['setlist', setlistId] })
      qc.invalidateQueries({ queryKey: ['setlists'] })
      onAdded()
    },
    onError: (e) => setError(e.response?.data?.error || t('errors.addSong')),
  })

  return (
    <div className="card no-print" style={{ margin: '0 0 4px', borderTop: 'none', borderRadius: 0 }}>
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <SongPicker namespace="setlists" pending={addSongs.isPending} onAdd={(songs) => addSongs.mutate(songs)} />
    </div>
  )
}
