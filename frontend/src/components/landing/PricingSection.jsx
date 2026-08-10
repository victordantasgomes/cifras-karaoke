import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../services/api'

/** Planos reais, buscados de GET /public/plans (rota pública, sem auth —
 * ver Fase 5 do plano). Igual Pricing.jsx, a moeda de cobrança é sempre
 * BRL; só a formatação de pontuação acompanha o idioma da interface. */
export default function PricingSection() {
  const { t, i18n } = useTranslation('landing')

  const centavosParaMoeda = (cents) =>
    (cents / 100).toLocaleString(i18n.language, { style: 'currency', currency: 'BRL' })

  const { data: plans, isLoading } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api.get('/public/plans').then((r) => r.data),
  })

  return (
    <section id="planos">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('pricing.title')}</h2>
          <p className="landing-section-sub">{t('pricing.subtitle')}</p>
        </div>

        {isLoading && <div className="page-sub" style={{ textAlign: 'center' }}>{t('pricing.loading')}</div>}
        {!isLoading && plans?.length === 0 && (
          <div className="page-sub" style={{ textAlign: 'center' }}>{t('pricing.empty')}</div>
        )}

        {!isLoading && plans?.length > 0 && (
          <div className="landing-pricing-grid">
            {plans.map((p) => (
              <div key={p.id} className="card landing-pricing-card">
                <h3>{p.name}</h3>
                <div className="landing-pricing-price">
                  {centavosParaMoeda(p.price_cents)}<span>{t('pricing.perMonth')}</span>
                </div>
                <ul className="landing-pricing-features">
                  <li>{t('pricing.setlistsLimit', { count: p.max_setlists })}</li>
                  <li>{t('pricing.storageLimit', { mb: p.storage_limit_mb })}</li>
                </ul>
                <Link to="/cadastro" className="btn primary">{t('pricing.cta')}</Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
