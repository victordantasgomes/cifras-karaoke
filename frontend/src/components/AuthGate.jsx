import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { useAuthStore } from '../store/authStore'

/** Mecanismo único de "gate" pra ações de escrita na área pública (sem
 * login) — ver plano da página principal pública. `requireAuth(actionKey, fn)`
 * dispara `fn()` normalmente se há sessão; sem sessão, abre um modal
 * genérico em vez de chamar `fn` (nunca bate na API sem token). `actionKey`
 * indexa `publicHome:gate.<actionKey>` pra escolher a mensagem — hoje só
 * "favorite" existe, mas qualquer ação de escrita futura na área pública
 * reusa este mesmo hook sem duplicar modal/mensagem por botão. */
export function useAuthGate() {
  const { t } = useTranslation('publicHome')
  const token = useAuthStore((s) => s.token)
  const [pendingAction, setPendingAction] = useState(null)

  const requireAuth = (actionKey, fn) => {
    if (token) return fn()
    setPendingAction(actionKey)
  }

  const modal = pendingAction && (
    <Modal title={t('gate.title')} onClose={() => setPendingAction(null)}>
      <p style={{ marginBottom: 16 }}>{t(`gate.${pendingAction}`)}</p>
      <div className="row" style={{ gap: 8 }}>
        <Link className="btn primary" to="/cadastro">{t('gate.signup')}</Link>
        <Link className="btn ghost" to="/login">{t('gate.login')}</Link>
      </div>
    </Modal>
  )

  return { requireAuth, modal }
}
