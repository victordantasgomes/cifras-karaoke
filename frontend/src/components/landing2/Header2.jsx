import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandLogo from '../BrandLogo'
import ThemeToggle from '../ThemeToggle'

/** Cabeçalho de /main2 e /sobre2 — inspirado na referência: logo + uma
 * alternância de 2 "conceitos" em vez do menu de âncoras/login/cadastro que
 * LandingHeader.jsx usa. Diferente da referência (onde o alternador entre
 * os dois conceitos está quebrado — só um dos dois abre de verdade), aqui a
 * troca funciona de verdade: navega entre /main2 e /sobre2. Sem
 * entrar/criar conta — fiel ao cabeçalho da referência. */
export default function Header2({ page }) {
  const { t } = useTranslation('landing2')
  const location = useLocation()

  return (
    <header className="landing-header no-print">
      <Link to="/main2"><BrandLogo className="landing-logo" /></Link>
      <nav className="landing-concept-toggle">
        <Link to="/main2" className={`landing-concept-toggle-item${location.pathname === '/main2' ? ' active' : ''}`}>
          {t(`${page}.header.toggle1`)}
        </Link>
        <Link to="/sobre2" className={`landing-concept-toggle-item${location.pathname === '/sobre2' ? ' active' : ''}`}>
          {t(`${page}.header.toggle2`)}
        </Link>
      </nav>
      <div className="landing-header-actions">
        <ThemeToggle />
      </div>
    </header>
  )
}
