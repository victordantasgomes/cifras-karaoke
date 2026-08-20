import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandLogo from '../BrandLogo'
import ThemeToggle from '../ThemeToggle'

/** Cabeçalho fixo da landing — mesmos links âncora do rodapé (LandingFooter).
 * Respeita o tema do visitante (BrandLogo escolhe a variante certa da logo),
 * com o ícone de alternância disponível aqui, igual ao resto do app. */
export default function LandingHeader({ onNavigate }) {
  const { t } = useTranslation('landing')

  return (
    <header className="landing-header">
      <BrandLogo alt="TumTumPa" className="landing-logo" />
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
