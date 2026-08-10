import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logo from '../../assets/logo-horizontal.png'

/** Cabeçalho fixo da landing — mesmos links âncora do rodapé (LandingFooter). */
export default function LandingHeader({ onNavigate }) {
  const { t } = useTranslation('landing')

  return (
    <header className="landing-header">
      <img src={logo} alt="Cifras Karaokê" className="landing-logo" />
      <nav className="landing-nav">
        <button onClick={() => onNavigate('recursos')}>{t('header.navFeatures')}</button>
        <button onClick={() => onNavigate('como-funciona')}>{t('header.navHowItWorks')}</button>
        <button onClick={() => onNavigate('planos')}>{t('header.navPricing')}</button>
        <button onClick={() => onNavigate('depoimentos')}>{t('header.navTestimonials')}</button>
        <button onClick={() => onNavigate('faq')}>{t('header.navFaq')}</button>
      </nav>
      <div className="landing-header-actions">
        <Link to="/login" className="btn ghost">{t('header.login')}</Link>
        <Link to="/cadastro" className="btn primary">{t('header.signup')}</Link>
      </div>
    </header>
  )
}
