import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'

/** Modal de criação de medley (SetlistDetail.jsx) — lista só as músicas já
 * presentes NESTE setlist (não busca na biblioteca inteira, ao contrário de
 * SongPicker.jsx). Escolha por clique-na-ordem: cada clique numa linha ainda
 * não escolhida entra no fim de `order` (índices originais em `items`, na
 * ordem de execução desejada); clicar de novo remove — sem precisar de
 * drag-and-drop pra definir a ordem. `isEligible` decide quais linhas ficam
 * clicáveis (mesmo filtro do botão "Criar medley": modo rolagem, ainda fora
 * de outro medley — ver SetlistDetail.jsx::isEligibleForMedley). */
export default function MedleyModal({ items, isEligible, onConfirm, onClose }) {
  const { t } = useTranslation('setlistDetail')
  const [order, setOrder] = useState([])

  const toggle = (idx) => setOrder((prev) => (
    prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]
  ))

  const reasonFor = (item) => {
    if (!item.song) return t('medleyReasonNotFound')
    if (item.medley_id) return t('medleyReasonAlreadyGrouped')
    if ((item.song.modo_execucao || 'rolagem') !== 'rolagem') return t('medleyReasonKaraokeMode')
    return null
  }

  return (
    <Modal title={t('createMedley')} onClose={onClose} maxWidth={560}>
      <p className="page-sub" style={{ marginTop: 0 }}>{t('medleyModalHint')}</p>
      <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, idx) => {
          const eligible = isEligible(item)
          const reason = eligible ? null : reasonFor(item)
          const chosenAt = order.indexOf(idx)
          return (
            <div key={item.ref + idx}
              onClick={() => eligible && toggle(idx)}
              className="row"
              style={{
                gap: 10, padding: '8px 10px', borderRadius: 8, flexWrap: 'nowrap',
                cursor: eligible ? 'pointer' : 'default',
                opacity: eligible ? 1 : 0.45,
                background: chosenAt >= 0 ? 'var(--accent-soft)' : 'transparent',
              }}>
              <span className="chip" style={{ minWidth: 20, textAlign: 'center', flexShrink: 0 }}>
                {chosenAt >= 0 ? chosenAt + 1 : idx + 1}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.song?.titulo || item.ref}
                </div>
                <div className="meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.song?.interprete || ''}
                  {reason && <span style={{ marginLeft: 6 }}>· {reason}</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" disabled={order.length < 2} onClick={() => onConfirm(order)}>
          {t('confirmMedley')}
        </button>
      </div>
    </Modal>
  )
}
