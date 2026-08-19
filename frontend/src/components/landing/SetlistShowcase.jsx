import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** Cartão de setlist compartilhável — inspirado na seção "SETLIST" da
 * referência visual. Conteúdo ilustrativo (nomes de música genéricos, não
 * reais), mesmo espírito do mockup do Hero — demonstra o RECURSO real
 * (setlists compartilháveis, já listado em Capabilities), não inventa
 * estatística nem depoimento.
 *
 * `showHeader` (opcional, padrão false — usado por /main2 e /sobre2, não
 * muda o comportamento existente em /sobre): mostra um cabeçalho
 * ilustrativo (data/nome do show/duração total) + uma coluna de duração
 * por música, pra bater com o layout da referência. */
const ROWS = [1, 2, 3, 4]

export default function SetlistShowcase({ showHeader = false }) {
  const { t } = useTranslation('landing')
  const { t: t2 } = useTranslation('landing2')

  return (
    <section id="setlist">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('setlistShowcase.title')}</h2>
          <p className="landing-section-sub">{t('setlistShowcase.subtitle')}</p>
        </div>
        <div className="card landing-setlist-card">
          {showHeader && (
            <div className="landing-setlist-header">
              <span>{t2('shared.setlistDate')}</span>
              <span>{t2('shared.setlistShow')}</span>
              <span>{t2('shared.setlistDuration')}</span>
            </div>
          )}
          {ROWS.map((n) => (
            <div key={n} className="landing-setlist-row">
              <span className="landing-setlist-num">{String(n).padStart(2, '0')}</span>
              <span className="landing-setlist-title">{t(`setlistShowcase.song${n}`)}</span>
              <span className="landing-setlist-key">{t(`setlistShowcase.song${n}Key`)}</span>
              {showHeader && <span className="landing-setlist-duration">{t2(`shared.song${n}Duration`)}</span>}
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
