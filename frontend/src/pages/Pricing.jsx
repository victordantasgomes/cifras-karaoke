import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

/**
 * Escolha de plano + checkout (Fase 7) — sessão hospedada da própria
 * Stripe, nunca tocamos em dado de cartão aqui. `success_url`/`cancel_url`
 * apontam pra esta mesma página com `?checkout=sucesso|cancelado`, já que
 * o estado de verdade da assinatura só é confirmado pelo webhook (ver
 * BillingCard em Settings.jsx, que consulta GET /billing/status).
 */
function centavosParaReais(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Pricing() {
  const [params] = useSearchParams()
  const checkout = params.get('checkout')
  const [busyPlanId, setBusyPlanId] = useState(null)
  const [error, setError] = useState('')

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  })

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
      setError(e.response?.data?.error || 'Não foi possível iniciar o checkout.')
      setBusyPlanId(null)
    }
  }

  return (
    <>
      <h1 className="page-title">Planos</h1>
      <div className="page-sub">14 dias grátis em qualquer plano — cancele quando quiser.</div>

      {checkout === 'sucesso' && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--accent, #46c48a)' }}>
          Assinatura iniciada! Pode levar alguns segundos até o status atualizar aqui.
        </div>
      )}
      {checkout === 'cancelado' && (
        <div className="card" style={{ marginBottom: 14 }}>
          Checkout cancelado — nenhuma cobrança foi feita.
        </div>
      )}
      {error && <div className="error-text" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {plans?.map((p) => (
          <div key={p.id} className="card" style={{ minWidth: 220, flex: '1 1 220px' }}>
            <h3 style={{ marginBottom: 8 }}>{p.name}</h3>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
              {centavosParaReais(p.price_cents)}<span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>/mês</span>
            </div>
            <ul style={{ color: 'var(--muted)', margin: '0 0 16px', paddingLeft: 18 }}>
              <li>Até {p.max_setlists} setlists</li>
              <li>{p.storage_limit_mb} MB de armazenamento de áudio</li>
            </ul>
            <button className="btn primary" disabled={busyPlanId === p.id} onClick={() => assinar(p.id)}>
              {busyPlanId === p.id ? 'Redirecionando…' : 'Assinar'}
            </button>
          </div>
        ))}
        {plans?.length === 0 && (
          <div className="page-sub">Nenhum plano disponível no momento.</div>
        )}
      </div>
    </>
  )
}
