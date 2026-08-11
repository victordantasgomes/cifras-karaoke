import { useTranslation } from 'react-i18next'

/** 3 passos resumidos (visão rápida) — versão mais detalhada fica em
 * HowItWorks.jsx logo abaixo desta seção. Foto ao lado (ver README em
 * public/images/landing/) reforça a ideia de "do arquivo ao palco" com
 * um músico de verdade em cena, não só cards de texto. */
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
        <div className="landing-journey-layout">
          <div className="landing-journey-list">
            {steps.map((s) => (
              <div key={s.num} className="card landing-journey-card">
                <div className="landing-journey-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="landing-journey-photo-frame">
            <img src="/images/landing/journey.jpg" alt="" className="landing-journey-photo" />
          </div>
        </div>
      </div>
    </section>
  )
}
