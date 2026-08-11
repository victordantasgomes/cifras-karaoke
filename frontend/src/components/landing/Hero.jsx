import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** Seção de abertura — headline, CTA e uma foto de banda ao vivo (ver
 * README em public/images/landing/) com o mockup do modo karaokê
 * flutuando por cima. O mockup em si continua sendo uma div com "chrome"
 * de app falso, não é screenshot real, mas mostra fielmente como a tela
 * de karaokê se parece. */
export default function Hero() {
  const { t } = useTranslation('landing')

  return (
    <section id="hero" className="landing-hero">
      <div className="landing-hero-content">
        <span className="landing-eyebrow">{t('hero.eyebrow')}</span>
        <h1 className="landing-hero-title">{t('hero.title')}</h1>
        <p className="landing-hero-sub">{t('hero.subtitle')}</p>
        <div className="landing-hero-actions">
          <Link to="/cadastro" className="btn primary">{t('hero.cta')}</Link>
          <span className="landing-trial-badge">{t('hero.trialBadge')}</span>
        </div>
      </div>
      <div className="landing-hero-visual">
        <div className="landing-hero-photo-frame">
          <img src="/images/landing/hero.jpg" alt="" className="landing-hero-photo" />

          <div className="landing-mockup landing-mockup-float">
            <div className="landing-mockup-chrome">
              <span className="landing-mockup-dot" />
              <span className="landing-mockup-dot" />
              <span className="landing-mockup-dot" />
              <span className="landing-mockup-badge">{t('hero.mockupBadge')}</span>
            </div>
            <div className="landing-mockup-body">
              <div className="landing-mockup-song">{t('hero.mockupSong')}</div>
              <div className="landing-mockup-line">
                <span className="landing-mockup-chord">{t('hero.mockupChord1')}</span>
                <span>{t('hero.mockupLine1')}</span>
              </div>
              <div className="landing-mockup-line active">
                <span className="landing-mockup-chord">{t('hero.mockupChord2')}</span>
                <span>{t('hero.mockupLine2')}</span>
              </div>
              <div className="landing-mockup-line">
                <span className="landing-mockup-chord">{t('hero.mockupChord3')}</span>
                <span>{t('hero.mockupLine3')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
