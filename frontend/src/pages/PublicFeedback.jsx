import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

const NOTAS = Array.from({ length: 10 }, (_, i) => i + 1)

/** Formulário público de feedback da plateia (`/feedback/:token`, sem
 * login) — aberto via QR code (ver FeedbackQRModal.jsx). Faz poll leve pra
 * saber qual música está tocando agora (server-side, ver
 * FeedbackService.public_status — nunca confia em música escolhida pelo
 * cliente) e envia uma nota (1-10) + nome/comentário opcionais pra ela. */
export default function PublicFeedback() {
  const { t } = useTranslation('publicFeedback')
  const { token } = useParams()
  const qc = useQueryClient()
  const [nota, setNota] = useState(null)
  const [nome, setNome] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [justSubmitted, setJustSubmitted] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-feedback-status', token],
    queryFn: () => api.get(`/public/feedback/${token}`).then((r) => r.data),
    refetchInterval: 4000,
  })

  const submit = useMutation({
    mutationFn: () => api.post(`/public/feedback/${token}`, { nota, nome, observacoes }),
    onSuccess: () => {
      setJustSubmitted(true)
      setNota(null); setNome(''); setObservacoes('')
      qc.invalidateQueries({ queryKey: ['public-feedback-status', token] })
    },
  })

  const currentSongKey = data?.current_song ? `${data.current_song.titulo}|${data.current_song.interprete}` : null
  // volta ao formulário em branco assim que a música muda de verdade — sem
  // isso, "avaliar outra música" ficaria preso mostrando a tela de
  // "enviado" da música anterior até o usuário clicar em algo.
  const [lastSongKey, setLastSongKey] = useState(currentSongKey)
  if (currentSongKey !== lastSongKey) {
    setLastSongKey(currentSongKey)
    setJustSubmitted(false)
  }

  const wrap = (children) => (
    <div className="login-wrap">
      <div className="card login-card" style={{ textAlign: 'center' }}>
        <div className="page-title" style={{ marginBottom: 4 }}>{t('appName')}</div>
        {children}
      </div>
    </div>
  )

  if (isLoading) return wrap(<div className="empty">…</div>)
  if (isError || !data) return wrap(<div className="error-text">{t('invalidLink')}</div>)
  if (!data.active) return wrap(<div className="error-text">{t('sessionEnded')}</div>)

  if (!data.current_song) {
    return wrap(
      <>
        <div className="page-title" style={{ fontSize: 18, marginTop: 12 }}>{t('waitingTitle')}</div>
        <div className="page-sub">{t('waitingHint')}</div>
      </>,
    )
  }

  if (justSubmitted) {
    return wrap(
      <>
        <div className="page-title" style={{ fontSize: 18, marginTop: 12 }}>{t('submitted')}</div>
        <button className="btn" style={{ marginTop: 14 }} onClick={() => setJustSubmitted(false)}>
          {t('rateAnother')}
        </button>
      </>,
    )
  }

  return wrap(
    <>
      <div className="chip" style={{ marginTop: 8 }}>{t('nowPlaying')}</div>
      <div className="page-title" style={{ fontSize: 20, marginTop: 6 }}>{data.current_song.titulo}</div>
      <div className="page-sub">{data.current_song.interprete}</div>

      <div className="field" style={{ marginTop: 18, textAlign: 'left' }}>
        <label>{t('ratingLabel')}</label>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
          {NOTAS.map((n) => (
            <button key={n} type="button" className={`btn${nota === n ? ' primary' : ' ghost'}`}
              style={{ minWidth: 38, padding: '8px 0' }} onClick={() => setNota(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ textAlign: 'left' }}>
        <label>{t('nameLabel')}</label>
        <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>

      <div className="field" style={{ marginBottom: 0, textAlign: 'left' }}>
        <label>{t('commentsLabel')}</label>
        <textarea className="input" rows={3} placeholder={t('commentsPlaceholder')}
          value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </div>

      {submit.isError && <div className="error-text" style={{ marginTop: 12 }}>
        {submit.error?.response?.data?.error_code === 'FEEDBACK_NO_ACTIVE_SONG' ? t('errorNoActiveSong') : t('errorGeneric')}
      </div>}

      <div className="row" style={{ marginTop: 18, justifyContent: 'center' }}>
        <button className="btn primary" disabled={!nota || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? t('submitting') : t('submit')}
        </button>
      </div>
    </>,
  )
}
