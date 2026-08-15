import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

/** Indicativo do plano atual no topo da tela (entre o sino de alertas e o
 * menu do usuário) — leva pra tela de Planos ao clicar. Com plano PAGO
 * atribuído (`plan_name`, ver BillingService.get_status) mostra o nome dele;
 * sem plano pago mostra o rótulo genérico "Plano Gratuito" — nunca
 * "Convidado"/"Administrador" (schema.sql::plans kind), que são categoria
 * administrativa e só aparecem dentro da gestão de usuários (ver
 * Settings.jsx::UserRow), nunca pro próprio usuário. */
export default function PlanBadge() {
  const { t } = useTranslation('common')
  const { data } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then((r) => r.data),
    staleTime: 60_000,
  })
  if (!data) return null

  return (
    <Link to="/planos" className="chip plan-badge" title={t('planBadge.title')}>
      {data.plan_name ? t('planBadge.plan', { name: data.plan_name }) : t('planBadge.free')}
    </Link>
  )
}
