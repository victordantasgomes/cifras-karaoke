import { useTranslation } from 'react-i18next'
import { SUPPORTED_LOCALES } from '../../i18n'

/** "Uma tela, o show inteiro" — 3 estatísticas. Idiomas calculado de
 * verdade a partir de SUPPORTED_LOCALES (não hardcoded, nunca destoa se um
 * idioma for adicionado/removido). Instrumentos é o mesmo dado real de
 * Integrations.jsx (violão/teclado/ukulele). "Folhas no palco" é frase de
 * posicionamento, não uma métrica — mesmo tratamento que a própria
 * referência dá a ela. */
const INSTRUMENTS_COUNT = 3
const PAPER_COUNT = 0

export default function OneScreenStats({ page }) {
  const { t } = useTranslation('landing2')

  return (
    <section id="uma-tela">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t(`${page}.oneScreen.title`)}</h2>
          <p className="landing-section-sub">{t(`${page}.oneScreen.subtitle`)}</p>
        </div>
        <div className="landing-stat-row">
          <div className="landing-stat-item">
            <div className="landing-stat-value">{SUPPORTED_LOCALES.length}</div>
            <div className="landing-stat-label">{t(`${page}.oneScreen.languagesLabel`)}</div>
          </div>
          <div className="landing-stat-item">
            <div className="landing-stat-value">{INSTRUMENTS_COUNT}</div>
            <div className="landing-stat-label">{t(`${page}.oneScreen.instrumentsLabel`)}</div>
          </div>
          <div className="landing-stat-item">
            <div className="landing-stat-value">{PAPER_COUNT}</div>
            <div className="landing-stat-label">{t(`${page}.oneScreen.paperLabel`)}</div>
          </div>
        </div>
      </div>
    </section>
  )
}
