import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/** Modal genérico — não existia nenhum componente de modal/diálogo no
 * projeto até agora (checado antes de construir este). Fecha com Esc ou
 * clique no overlay; título + botão de fechar seguem o mesmo `.card`/`.btn`
 * do resto do design system (var(--bg-raise)/--stroke, igual ao
 * .chord-hover-card, o "painel flutuante" mais próximo que já existia). */
export default function Modal({ title, onClose, children, maxWidth = 520 }) {
  useEffect(() => {
    function onKeyDown(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return createPortal(
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-panel" style={{ maxWidth }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
