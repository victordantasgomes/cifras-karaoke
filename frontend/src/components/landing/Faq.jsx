import { useTranslation } from 'react-i18next'

/** Acordeão de perguntas frequentes — <details>/<summary> nativo, mesmo
 * padrão já usado em SongEditor.jsx (toggle de fórmulas), sem estado JS. */
export default function Faq() {
  const { t } = useTranslation('landing')
  const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    n,
    q: t(`faq.q${n}`),
    a: t(`faq.a${n}`),
  }))

  return (
    <section id="faq">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('faq.title')}</h2>
          <p className="landing-section-sub">{t('faq.subtitle')}</p>
        </div>
        <div className="landing-faq-list">
          {items.map((it) => (
            <details key={it.n} className="landing-faq-item">
              <summary>{it.q}</summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
