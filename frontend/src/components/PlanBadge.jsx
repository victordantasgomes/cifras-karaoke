import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

/** Indicativo do plano atual no topo da tela (entre o sino de alertas e o
 * menu do usuário) — leva pra tela de Planos ao clicar. Sem plano pago
 * atribuído (`plan_name` nulo, ver BillingService.get_status), mostra
 * "Plano Administrador" ou "Plano Convidado" conforme `user.is_admin` —
 * mesma categoria que QuotaService resolve pro limite de quem não paga
 * (ver quota_service.py::_plan_limits). */
export default function PlanBadge() {
  const { t } = useTranslation('common')
  const user = useAuthStore((s) => s.user)
  const { data } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then((r) => r.data),
    staleTime: 60_000,
  })
  if (!data) return null

  const label = data.plan_name
    ? t('planBadge.plan', { name: data.plan_name })
    : user?.is_admin ? t('planBadge.admin') : t('planBadge.guest')

  return (
    <Link to="/planos" className="chip plan-badge" title={t('planBadge.title')}>
      {label}
    </Link>
  )
}
