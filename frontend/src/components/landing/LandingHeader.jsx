import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ThemeToggle from '../ThemeToggle'
import logo from '../../assets/logo-tumtumpa-banner.png'

/** Cabeçalho fixo da landing — mesmos links âncora do rodapé (LandingFooter).
 * Logo própria (arte com fundo preto, não é o logotipo transparente que
 * BrandLogo alterna por tema) — fica igual nos dois temas de propósito. O
 * ícone de alternância continua disponível aqui, igual ao resto do app. */
export default function LandingHeader({ onNavigate }) {
  const { t } = useTranslation('landing')

  return (
    <header className="landing-header">
      <img src={logo} alt="TumTumPa" className="landing-logo" />
      <nav className="landing-nav">
        <button onClick={() => onNavigate('explorar')}>{t('header.navExplore')}</button>
        <button onClick={() => onNavigate('recursos')}>{t('header.navFeatures')}</button>
        <button onClick={() => onNavigate('como-funciona')}>{t('header.navHowItWorks')}</button>
        <button onClick={() => onNavigate('mural')}>{t('header.navBandBoard')}</button>
        <button onClick={() => onNavigate('planos')}>{t('header.navPricing')}</button>
        <button onClick={() => onNavigate('faq')}>{t('header.navFaq')}</button>
      </nav>
      <div className="landing-header-actions">
        <ThemeToggle />
        <Link to="/login" className="btn ghost">{t('header.login')}</Link>
        <Link to="/cadastro" className="btn primary">{t('header.signup')}</Link>
      </div>
    </header>
  )
}
