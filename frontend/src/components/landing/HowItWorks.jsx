import { useTranslation } from 'react-i18next'

/** Passo-a-passo mais detalhado que Journey.jsx (5 etapas em vez de 3),
 * cobrindo o fluxo completo até o palco. */
export default function HowItWorks() {
  const { t } = useTranslation('landing')
  const steps = [1, 2, 3, 4, 5].map((n) => ({
    n,
    title: t(`howItWorks.step${n}Title`),
    desc: t(`howItWorks.step${n}Desc`),
  }))

  return (
    <section id="como-funciona">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('howItWorks.title')}</h2>
          <p className="landing-section-sub">{t('howItWorks.subtitle')}</p>
        </div>
        <div className="landing-steps-grid">
          {steps.map((s) => (
            <div key={s.n} className="card landing-step-card">
              <span className="landing-step-index">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
