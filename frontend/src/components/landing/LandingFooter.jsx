import { useTranslation } from 'react-i18next'
import logo from '../../assets/logo-tumtumpa-wide.png'

/** Rodapé — espelha os links âncora do cabeçalho (LandingHeader). Mesma logo
 * fixa do cabeçalho (LandingHeader.jsx), não a BrandLogo alternável por tema. */
export default function LandingFooter({ onNavigate }) {
  const { t } = useTranslation('landing')

  return (
    <footer className="landing-footer">
      <div className="landing-footer-brand">
        <img src={logo} alt="TumTumPa" />
        <span className="landing-footer-tagline">{t('footer.tagline')}</span>
      </div>
      <nav className="landing-footer-nav">
        <button onClick={() => onNavigate('explorar')}>{t('header.navExplore')}</button>
        <button onClick={() => onNavigate('recursos')}>{t('header.navFeatures')}</button>
        <button onClick={() => onNavigate('como-funciona')}>{t('header.navHowItWorks')}</button>
        <button onClick={() => onNavigate('mural')}>{t('header.navBandBoard')}</button>
        <button onClick={() => onNavigate('planos')}>{t('header.navPricing')}</button>
        <button onClick={() => onNavigate('faq')}>{t('header.navFaq')}</button>
      </nav>
      <div className="landing-footer-rights">{t('footer.rights', { year: new Date().getFullYear() })}</div>
    </footer>
  )
}
