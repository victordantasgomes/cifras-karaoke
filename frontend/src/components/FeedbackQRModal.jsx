import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import Modal from './Modal'
import api from '../services/api'

/** QR code grande da sessão de feedback ativa (SetlistDetail.jsx, botão
 * "Mostrar QR Code") — aponta pra `/feedback/:token` (PublicFeedback.jsx,
 * sem login). Mostra a música tocando agora com poll leve (só enquanto o
 * modal está aberto, ver `refetchInterval`) pra confirmar visualmente que o
 * player já está avisando o backend corretamente. */
export default function FeedbackQRModal({ token, onClose }) {
  const { t } = useTranslation('setlistDetail')
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}/feedback/${token}`

  const { data: status } = useQuery({
    queryKey: ['feedback-public-status', token],
    queryFn: () => api.get(`/public/feedback/${token}`).then((r) => r.data),
    refetchInterval: 4000,
  })

  const copyLink = () => {
    navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal title={t('feedbackQrTitle')} onClose={onClose} maxWidth={380}>
      <p className="page-sub" style={{ marginTop: 0, textAlign: 'center' }}>{t('feedbackQrHint')}</p>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 16, background: '#fff', borderRadius: 12 }}>
        <QRCodeSVG value={url} size={240} />
      </div>
      <div className="row" style={{ marginTop: 16, gap: 8 }}>
        <input className="input" readOnly value={url} style={{ flex: 1, fontSize: 12.5 }}
          onFocus={(e) => e.target.select()} />
        <button className="btn" onClick={copyLink}>{copied ? t('feedbackLinkCopied') : t('feedbackCopyLink')}</button>
      </div>
      <div className="page-sub" style={{ marginTop: 16, textAlign: 'center' }}>
        {status?.current_song
          ? t('feedbackNowPlaying', { nome: `${status.current_song.titulo} — ${status.current_song.interprete}` })
          : t('feedbackWaiting')}
      </div>
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>{t('close')}</button>
      </div>
    </Modal>
  )
}
