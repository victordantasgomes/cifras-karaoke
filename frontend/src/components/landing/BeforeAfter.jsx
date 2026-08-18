import { useTranslation } from 'react-i18next'
import ChordSheet from '../ChordSheet'

/** "Do arquivo ao palco" — antes/depois inspirado na referência visual.
 * Conteúdo ilustrativo (não é uma música real do acervo, mesmo espírito do
 * mockup que Hero.jsx já usa) — mas o lado "depois" passa pelo MESMO
 * ChordSheet.jsx real do app, então é uma demonstração de verdade da
 * formatação, não uma captura de tela inventada. */
export default function BeforeAfter() {
  const { t } = useTranslation('landing')
  const demoBody = t('beforeAfter.demoBody')

  return (
    <section id="do-arquivo-ao-palco">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('beforeAfter.title')}</h2>
          <p className="landing-section-sub">{t('beforeAfter.subtitle')}</p>
        </div>
        <div className="landing-before-after">
          <div className="landing-before-after-col">
            <span className="landing-before-after-label">{t('beforeAfter.rawLabel')}</span>
            <div className="landing-before-after-raw">{demoBody}</div>
          </div>
          <div className="landing-before-after-col">
            <span className="landing-before-after-label">{t('beforeAfter.syncedLabel')}</span>
            <div className="card"><ChordSheet body={demoBody} /></div>
          </div>
        </div>
      </div>
    </section>
  )
}
