import { useTranslation } from 'react-i18next'
import {
  IconBook, IconWaveform, IconMic, IconScroll, IconList,
  IconChordGrid, IconSwap, IconFootPedal, IconGlobe,
} from '../icons'

// ícone é decidido aqui (não vem mais do i18n) — um ícone não muda de
// idioma pra idioma, só o texto ao lado dele.
const ICONS = [IconBook, IconWaveform, IconMic, IconScroll, IconList, IconChordGrid, IconSwap, IconFootPedal, IconGlobe]

/** Grade de recursos — 9 itens (de um total de ~11 sugeridos, para não
 * lotar demais a seção). */
export default function Capabilities() {
  const { t } = useTranslation('landing')
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    n,
    Icon: ICONS[n - 1],
    title: t(`capabilities.item${n}Title`),
    desc: t(`capabilities.item${n}Desc`),
  }))

  return (
    <section id="recursos">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('capabilities.title')}</h2>
          <p className="landing-section-sub">{t('capabilities.subtitle')}</p>
        </div>
        <div className="landing-capabilities-grid">
          {items.map((it) => (
            <div key={it.n} className="card landing-capability-card">
              <div className="landing-capability-icon"><it.Icon /></div>
              <h3>{it.title}</h3>
              <p>{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
