import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

/** Indicativo do plano atual no topo da tela (entre o sino de alertas e o
 * menu do usuário) — leva pra tela de Planos ao clicar. Com plano PAGO
 * atribuído (`plan_name`, ver BillingService.get_status) mostra o nome dele;
 * sem plano pago mostra "Plano Gratuito", com um sufixo revelando a
 * categoria administrativa quando houver (`category`: 'admin'/'guest', ver
 * BillingService.get_status) — "Plano Gratuito - Convidado" ou "Plano
 * Gratuito - ADMIN". Conta legada (grandfathered, sem categoria) mostra só
 * "Plano Gratuito", sem sufixo. */
export default function PlanBadge() {
  const { t } = useTranslation('common')
  const { data } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then((r) => r.data),
    staleTime: 60_000,
  })
  if (!data) return null

  const label = data.plan_name
    ? t('planBadge.plan', { name: data.plan_name })
    : data.category === 'admin' ? t('planBadge.freeAdmin')
    : data.category === 'guest' ? t('planBadge.freeGuest')
    : t('planBadge.free')

  return (
    <Link to="/planos" className="chip plan-badge" title={t('planBadge.title')}>
      {label}
    </Link>
  )
}
