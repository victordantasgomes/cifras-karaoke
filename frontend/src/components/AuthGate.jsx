import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { centavosParaMoeda } from '../utils/currency'

/** Mecanismo único de "gate" pra ações de escrita na área pública (sem
 * login) — ver plano da página principal pública. `requireAuth(actionKey, fn)`
 * dispara `fn()` normalmente se há sessão; sem sessão, abre um modal
 * genérico em vez de chamar `fn` (nunca bate na API sem token). `actionKey`
 * indexa `publicHome:gate.<actionKey>` pra escolher a mensagem — qualquer
 * ação de escrita/item bloqueado na área pública reusa este mesmo hook sem
 * duplicar modal/mensagem por botão.
 *
 * O modal também mostra uma grade compacta de planos reais (GET
 * /public/plans, mesma queryKey que PricingSection.jsx já usa — sem
 * requisição duplicada), incluindo o plano Convidado/gratuito
 * (plan.kind==='guest', que list_public() passou a expor — ver
 * backend/services/plans_service.py). Só os campos reais (setlists/
 * armazenamento/preço) — nunca lista de recursos inventada. */
export function useAuthGate() {
  const { t, i18n } = useTranslation('publicHome')
  const token = useAuthStore((s) => s.token)
  const [pendingAction, setPendingAction] = useState(null)

  const { data: plans } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api.get('/public/plans').then((r) => r.data),
    enabled: Boolean(pendingAction),
  })

  const requireAuth = (actionKey, fn) => {
    if (token) return fn()
    setPendingAction(actionKey)
  }

  const modal = pendingAction && (
    <Modal title={t('gate.title')} onClose={() => setPendingAction(null)} maxWidth={640}>
      <p style={{ marginBottom: 16 }}>{t(`gate.${pendingAction}`)}</p>
      <div className="row" style={{ gap: 8, marginBottom: plans?.length ? 20 : 0 }}>
        <Link className="btn primary" to="/cadastro">{t('gate.signup')}</Link>
        <Link className="btn ghost" to="/login">{t('gate.login')}</Link>
      </div>
      {plans?.length > 0 && (
        <div className="landing-pricing-grid" style={{ gap: 10 }}>
          {plans.map((p) => (
            <div key={p.id} className="card" style={{ padding: 14 }}>
              <h3 style={{ fontSize: 14, marginBottom: 4 }}>
                {p.name}{p.kind === 'guest' && <span className="chip" style={{ marginLeft: 6 }}>{t('gate.freeBadge')}</span>}
              </h3>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                {p.price_cents === 0 ? t('gate.freePrice') : (
                  <>{centavosParaMoeda(p.price_cents, i18n.language)}<span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> {t('gate.perMonth')}</span></>
                )}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.7 }}>
                <div>{t('gate.setlistsLimit', { count: p.max_setlists })}</div>
                <div>{t('gate.storageLimit', { mb: p.storage_limit_mb })}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )

  return { requireAuth, modal }
}
