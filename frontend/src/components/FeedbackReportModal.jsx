import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import api from '../services/api'

/** Relatório de notas do feedback da plateia (SetlistDetail.jsx, botão "Ver
 * relatório") — soma o histórico INTEIRO da setlist (todas as sessões já
 * ativadas, não só a mais recente, ver FeedbackService.report). Uma linha
 * por música (média + contagem), expansível pra ver nome/nota/comentário de
 * cada avaliação individual. */
export default function FeedbackReportModal({ setlistId, onClose }) {
  const { t } = useTranslation('setlistDetail')
  const [expanded, setExpanded] = useState(null)

  const { data } = useQuery({
    queryKey: ['feedback-report', setlistId],
    queryFn: () => api.get(`/setlists/${setlistId}/feedback/report`).then((r) => r.data),
  })

  return (
    <Modal title={t('feedbackReportTitle')} onClose={onClose} maxWidth={640}>
      {!data?.length && <div className="empty">{t('feedbackReportEmpty')}</div>}
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {data?.map((entry) => (
          <div key={entry.song_slug} className="card" style={{ marginBottom: 10, padding: 0 }}>
            <div className="row" style={{ padding: '10px 14px', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setExpanded((cur) => (cur === entry.song_slug ? null : entry.song_slug))}>
              <div>
                <div className="title">{entry.titulo}</div>
                <div className="meta">{entry.interprete}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="chip">★ {entry.media}</span>
                <span className="meta">{t('feedbackReportVotes', { count: entry.count })}</span>
              </div>
            </div>
            {expanded === entry.song_slug && (
              <div style={{ borderTop: '1px solid var(--stroke)', padding: '10px 14px' }}>
                <div className="section-heading">{t('feedbackReportComments')}</div>
                {entry.avaliacoes.map((a, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="chip">★ {a.nota}</span>
                      {a.nome && <span className="meta">{a.nome}</span>}
                    </div>
                    {a.observacoes && <div style={{ fontSize: 13.5, marginTop: 2 }}>{a.observacoes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>{t('close')}</button>
      </div>
    </Modal>
  )
}
