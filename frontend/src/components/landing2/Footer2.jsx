import { useTranslation } from 'react-i18next'
import logo from '../../assets/logo-horizontal-preta.png'

/** Rodapé de /sobre2 — minimalista (logo + tagline + copyright), sem a
 * fileira de navegação que LandingFooter.jsx tem — a referência também não
 * tem nav no rodapé. */
export default function Footer2({ page }) {
  const { t } = useTranslation('landing2')

  return (
    <footer className="landing-footer">
      <div className="landing-footer-brand">
        <img src={logo} alt="TumTumPa" />
        <span className="landing-footer-tagline">{t(`${page}.footer.tagline`)}</span>
      </div>
      <div className="landing-footer-rights">{t('landing:footer.rights', { year: new Date().getFullYear() })}</div>
    </footer>
  )
}
