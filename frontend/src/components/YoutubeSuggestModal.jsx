import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { buildEmbedUrl } from '../utils/youtube'

/** Modal do botão "Sugerir" (cabeçalho da música, ver SongEditor.jsx) — o
 * backend já devolve vários candidatos numa chamada só (search_videos, ver
 * youtube_service.py: a cota da API é por chamada, não por resultado), o
 * botão "Sugerir outro" só percorre essa lista já buscada, sem gastar cota
 * de novo a cada clique. Nada é salvo até o usuário clicar "Aceitar
 * sugestão" — cancelar ou fechar não muda o campo do cabeçalho. */
export default function YoutubeSuggestModal({ candidates, onAccept, onClose }) {
  const { t } = useTranslation('songEditor')
  const [index, setIndex] = useState(0)
  const current = candidates[index]

  const next = () => setIndex((i) => (i + 1) % candidates.length)

  return (
    <Modal title={t('edit.youtubeSuggestModalTitle')} onClose={onClose} maxWidth={480}>
      <div style={{ position: 'relative', paddingTop: '56.25%', marginBottom: 12, borderRadius: 8, overflow: 'hidden' }}>
        <iframe key={current.video_id} src={buildEmbedUrl(current.video_id)} title={current.title || 'YouTube'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen frameBorder="0"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      </div>
      {current.title && (
        <div className="page-sub" style={{ marginBottom: 12 }}>
          {current.title}
          {current.duration && <> · {current.duration}</>}
          {candidates.length > 1 && <> · {t('edit.youtubeSuggestCount', { current: index + 1, total: candidates.length })}</>}
        </div>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={candidates.length <= 1} onClick={next}>
          {t('edit.youtubeSuggestAnother')}
        </button>
        <button type="button" className="btn primary" onClick={() => onAccept(current.url, current.duration)}>
          {t('edit.youtubeSuggestAccept')}
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('edit.youtubeSuggestCancel')}
        </button>
      </div>
    </Modal>
  )
}
