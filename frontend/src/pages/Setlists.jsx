import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

export default function Setlists() {
  const { t } = useTranslation('setlists')
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
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
      <div className="card" style={{ padding: 0 }}>
        {!data?.length && <div className="empty">{t('empty')}</div>}
        {data?.map((s) => (
          <div key={s.id} className="song-row" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
            <Link to={`/setlists/${s.id}`}>
              <div className="title">{s.nome}</div>
              <div className="meta">
                {t('itemCount', { count: s.count })}
                {!s.is_owner && <span className="chip" style={{ marginLeft: 8 }} title={t('otherUserTitle')}>{t('otherUserChip')}</span>}
              </div>
            </Link>
            <div>
              {s.is_owner && (
                <label className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={s.shared}
                    onChange={(e) => toggleShare.mutate({ id: s.id, value: e.target.checked })} />
                  {t('shared')}
                </label>
              )}
            </div>
            <a className="btn" href="#" onClick={async (e) => {
              e.preventDefault()
              const { data: blob } = await api.get(`/setlists/${s.id}/export`, { responseType: 'blob' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = `${s.id}.txt`; a.click()
              URL.revokeObjectURL(url)
            }}>{t('export')}</a>
            <div>
              {s.is_owner && (
                <button className="btn danger"
                  onClick={() => confirm(t('deleteConfirm')) && remove.mutate(s.id)}>{t('delete')}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
