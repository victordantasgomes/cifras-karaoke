import { useTranslation } from 'react-i18next'

/** 3 passos resumidos (visão rápida) — versão mais detalhada fica em
 * HowItWorks.jsx logo abaixo desta seção. */
export default function Journey() {
  const { t } = useTranslation('landing')
  const steps = [1, 2, 3].map((n) => ({
    num: t(`journey.step${n}Num`),
    title: t(`journey.step${n}Title`),
    desc: t(`journey.step${n}Desc`),
  }))

  return (
    <section id="jornada">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('journey.title')}</h2>
          <p className="landing-section-sub">{t('journey.subtitle')}</p>
        </div>
        <div className="landing-journey-grid">
          {steps.map((s) => (
            <div key={s.num} className="card landing-journey-card">
              <div className="landing-journey-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
