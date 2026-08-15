import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

const INCLUDED_FEATURE_KEYS = ['karaoke', 'chordAssistant', 'transpose', 'sharing']

/**
 * Escolha de plano + checkout (Fase 7) — sessão hospedada da própria
 * Stripe, nunca tocamos em dado de cartão aqui. `success_url`/`cancel_url`
 * apontam pra esta mesma página com `?checkout=sucesso|cancelado`, já que
 * o estado de verdade da assinatura só é confirmado pelo webhook (ver
 * BillingCard em Settings.jsx, que consulta GET /billing/status).
 *
 * Mostra o card "Gratuito" (teto de quem não assinou nada — ver
 * QuotaService.FREE_MAX_SETLISTS/FREE_STORAGE_LIMIT_MB, vindo em
 * data.free_tier) lado a lado com os planos pagos, destaca qual é o plano
 * atual do usuário e sinaliza upgrade nos outros — não é só listagem, é
 * pitch: cada card tem uma frase de posicionamento (blurbFor) e um selo
 * de "mais popular" no plano do meio.
 */
export default function Pricing() {
  const { t, i18n } = useTranslation('pricing')
  const [params] = useSearchParams()
  const checkout = params.get('checkout')
  const [busyPlanId, setBusyPlanId] = useState(null)
  const [error, setError] = useState('')

  // moeda de cobrança é sempre BRL (ver backend/services/plans_service.py
  // ::_CURRENCY) independente do idioma da interface — só a formatação de
  // pontuação/posição do símbolo acompanha o idioma escolhido.
  const centavosParaMoeda = (cents) =>
    (cents / 100).toLocaleString(i18n.language, { style: 'currency', currency: 'BRL' })

  const { data } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  })
  const { data: status } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then((r) => r.data),
  })

  const plans = data?.items || []
  const freeTier = data?.free_tier
  const currentPlanId = status?.plan_id || null
  const currentPlan = plans.find((p) => p.id === currentPlanId) || null
  const isFreeCurrent = !!status && !currentPlanId

  // "mais popular" = plano do meio entre os pagos — só com 2+ planos
  // ativos faz sentido destacar um.
  const popularIndex = plans.length > 1 ? Math.floor((plans.length - 1) / 2) : -1

  // frase de posicionamento por POSIÇÃO (não pelo nome — livre, definido
  // pelo admin): intro pro mais barato, "sem limites" pro mais caro,
  // genérico pros do meio.
  const blurbFor = (index, total) => {
    if (total === 1) return t('blurbTop')
    if (index === 0) return t('blurbStarter')
    if (index === total - 1) return t('blurbTop')
    return t('blurbGrowing')
  }

  const assinar = async (planId) => {
    setBusyPlanId(planId); setError('')
    try {
      const base = window.location.origin + '/planos'
      const { data } = await api.post('/billing/checkout-session', {
        plan_id: planId,
        success_url: `${base}?checkout=sucesso`,
        cancel_url: `${base}?checkout=cancelado`,
      })
      window.location.href = data.url
    } catch (e) {
      setError(e.response?.data?.error || t('checkoutError'))
      setBusyPlanId(null)
    }
  }

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>

      {checkout === 'sucesso' && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--accent)' }}>
          {t('checkoutSuccess')}
        </div>
      )}
      {checkout === 'cancelado' && (
        <div className="card" style={{ marginBottom: 14 }}>
          {t('checkoutCanceled')}
        </div>
      )}
      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card no-print" style={{ marginBottom: 18 }}>
        <strong>{t('allPlansInclude')}</strong>
        <ul style={{ color: 'var(--muted)', margin: '8px 0 0', paddingLeft: 18 }}>
          {INCLUDED_FEATURE_KEYS.map((k) => <li key={k}>{t(`features.${k}`)}</li>)}
        </ul>
      </div>

      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {freeTier && (
          <div className="card" style={{ minWidth: 220, flex: '1 1 220px', borderColor: isFreeCurrent ? 'var(--accent)' : undefined }}>
            {isFreeCurrent && <div className="chip" style={{ marginBottom: 8 }}>{t('currentPlan')}</div>}
            <h3 style={{ marginBottom: 4 }}>{t('freeName')}</h3>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>{t('blurbFree')}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>{t('freePrice')}</div>
            <ul style={{ color: 'var(--muted)', margin: '0 0 16px', paddingLeft: 18 }}>
              <li>{t('setlistsLimit', { count: freeTier.max_setlists })}</li>
              <li>{t('storageLimit', { mb: freeTier.storage_limit_mb })}</li>
            </ul>
            {isFreeCurrent
              ? <button className="btn" disabled>{t('currentPlan')}</button>
              : <div className="page-sub" style={{ margin: 0 }}>{t('freeHint')}</div>}
          </div>
        )}
        {plans.map((p, i) => {
          const isCurrent = p.id === currentPlanId
          const isPopular = i === popularIndex
          const isUpgrade = !!currentPlan && p.price_cents > currentPlan.price_cents
          return (
            <div key={p.id} className="card" style={{
              minWidth: 220, flex: '1 1 220px',
              borderColor: isCurrent ? 'var(--accent)' : isPopular ? 'var(--accent-soft)' : undefined,
            }}>
              {isCurrent
                ? <div className="chip" style={{ marginBottom: 8 }}>{t('currentPlan')}</div>
                : isPopular && <div className="chip" style={{ marginBottom: 8 }}>{t('mostPopular')}</div>}
              <h3 style={{ marginBottom: 4 }}>{p.name}</h3>
              <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 12 }}>{blurbFor(i, plans.length)}</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
                {centavosParaMoeda(p.price_cents)}<span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>{t('perMonth')}</span>
              </div>
              <ul style={{ color: 'var(--muted)', margin: '0 0 16px', paddingLeft: 18 }}>
                <li>{t('setlistsLimit', { count: p.max_setlists })}</li>
                <li>{t('storageLimit', { mb: p.storage_limit_mb })}</li>
              </ul>
              {isCurrent ? (
                <Link className="btn" to="/configuracoes">{t('manageSubscription')}</Link>
              ) : (
                <button className="btn primary" disabled={busyPlanId === p.id} onClick={() => assinar(p.id)}>
                  {busyPlanId === p.id ? t('redirecting') : isUpgrade ? t('upgrade') : t('subscribe')}
                </button>
              )}
            </div>
          )
        })}
        {plans.length === 0 && (
          <div className="page-sub">{t('noPlans')}</div>
        )}
      </div>
    </>
  )
}
