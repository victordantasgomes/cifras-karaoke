import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** Cartão de setlist compartilhável — inspirado na seção "SETLIST" da
 * referência visual. Conteúdo ilustrativo (nomes de música genéricos, não
 * reais), mesmo espírito do mockup do Hero — demonstra o RECURSO real
 * (setlists compartilháveis, já listado em Capabilities), não inventa
 * estatística nem depoimento. */
const ROWS = [1, 2, 3, 4]

export default function SetlistShowcase() {
  const { t } = useTranslation('landing')

  return (
    <section id="setlist">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('setlistShowcase.title')}</h2>
          <p className="landing-section-sub">{t('setlistShowcase.subtitle')}</p>
        </div>
        <div className="card landing-setlist-card">
          {ROWS.map((n) => (
            <div key={n} className="landing-setlist-row">
              <span className="landing-setlist-num">{String(n).padStart(2, '0')}</span>
              <span className="landing-setlist-title">{t(`setlistShowcase.song${n}`)}</span>
              <span className="landing-setlist-key">{t(`setlistShowcase.song${n}Key`)}</span>
            </div>
          ))}
          <div className="landing-setlist-cta">
            <Link to="/cadastro" className="btn primary">{t('setlistShowcase.cta')}</Link>
          </div>
        </div>
      </div>
    </section>
  )
}
