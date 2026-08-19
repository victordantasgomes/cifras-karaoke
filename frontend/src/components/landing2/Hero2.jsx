import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** Hero de /sobre2 — coluna única, sem foto/mockup flutuante (diferente de
 * landing/Hero.jsx). Texto próprio, adaptado do papel da referência
 * (repertório "ganha vida" no palco), não traduzido dela. */
export default function Hero2({ page }) {
  const { t } = useTranslation('landing2')

  return (
    <section id="hero2" className="landing-hero2">
      <span className="landing-eyebrow">{t(`${page}.hero.eyebrow`)}</span>
      <h1 className="landing-hero-title">{t(`${page}.hero.title`)}</h1>
      <p className="landing-hero-sub">{t(`${page}.hero.subtitle`)}</p>
      <div className="landing-hero-actions">
        <Link to="/cadastro" className="btn primary">{t(`${page}.hero.cta`)}</Link>
      </div>
    </section>
  )
}
