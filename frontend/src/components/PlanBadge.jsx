import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

/** Indicativo do plano atual no topo da tela (entre o sino de alertas e o
 * menu do usuário) — leva pra tela de Planos ao clicar. Só aparece quando há
 * um plano PAGO atribuído (`plan_name`, ver BillingService.get_status) —
 * Convidado/Administrador (schema.sql::plans kind) são categoria
 * administrativa, não devem ser expostas ao próprio usuário (só dentro da
 * gestão de usuários, ver Settings.jsx::UserRow). */
export default function PlanBadge() {
  const { t } = useTranslation('common')
  const { data } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then((r) => r.data),
    staleTime: 60_000,
  })
  if (!data?.plan_name) return null

  return (
    <Link to="/planos" className="chip plan-badge" title={t('planBadge.title')}>
      {t('planBadge.plan', { name: data.plan_name })}
    </Link>
  )
}
