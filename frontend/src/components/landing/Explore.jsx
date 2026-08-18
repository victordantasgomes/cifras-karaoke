import { useTranslation } from 'react-i18next'

/** Prévia de 5 recursos (inspirada na seção "EXPLORE" da referência visual) —
 * reaproveita a mesma lista real de Capabilities.jsx (sincronização, modo
 * karaokê, transposição, setlists, pedal), só que com um recorte menor e
 * ícone em glifo monoespaçado em vez de SVG (mesmo espírito da referência,
 * que também usa símbolo/dingbat em vez de ícone desenhado). Reaproveita o
 * grid/card de .landing-capabilities-grid, não inventa layout novo. */
const ITEMS = [
  { glyph: '≋', key: 'sync', capabilityDesc: 'item2Desc' },
  { glyph: '▶', key: 'karaoke', capabilityDesc: 'item3Desc' },
  { glyph: '♯', key: 'transpose', capabilityDesc: 'item7Desc' },
  { glyph: '☷', key: 'setlists', capabilityDesc: 'item5Desc' },
  { glyph: '⌵', key: 'pedal', capabilityDesc: 'item8Desc' },
]

export default function Explore() {
  const { t } = useTranslation('landing')

  return (
    <section id="explorar">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('explore.title')}</h2>
          <p className="landing-section-sub">{t('explore.subtitle')}</p>
        </div>
        <div className="landing-capabilities-grid">
          {ITEMS.map((it) => (
            <div key={it.key} className="card landing-capability-card">
              <div className="landing-capability-icon">
                <span className="landing-glyph-icon">{it.glyph}</span>
              </div>
              <h3>{t(`explore.${it.key}Title`)}</h3>
              <p>{t(`capabilities.${it.capabilityDesc}`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
