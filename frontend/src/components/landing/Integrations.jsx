import { useTranslation } from 'react-i18next'

/** Seção curta: instrumentos cobertos pelo dicionário de acordes +
 * exportação de arquivo. Propositalmente leve (menos crítica que as
 * demais, ver plano da Fase 5). */
export default function Integrations() {
  const { t } = useTranslation('landing')
  const items = [1, 2, 3, 4].map((n) => ({
    n,
    icon: t(`integrations.item${n}Icon`),
    title: t(`integrations.item${n}Title`),
  }))

  return (
    <section id="integracoes" className="landing-integrations">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('integrations.title')}</h2>
          <p className="landing-section-sub">{t('integrations.subtitle')}</p>
        </div>
        <div className="landing-integrations-row">
          {items.map((it) => (
            <div key={it.n} className="landing-integration-item">
              <span>{it.icon}</span>
              <span>{it.title}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
