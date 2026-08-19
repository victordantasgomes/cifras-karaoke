import { Link } from 'react-router-dom'
import BrandLogo from '../BrandLogo'
import ThemeToggle from '../ThemeToggle'

/** Cabeçalho de /sobre — inspirado na referência: logo + toggle de tema,
 * sem o menu de âncoras/login/cadastro que LandingHeader.jsx usa. */
export default function Header2() {
  return (
    <header className="landing-header no-print">
      <Link to="/"><BrandLogo className="landing-logo" /></Link>
      <div className="landing-header-actions">
        <ThemeToggle />
      </div>
    </header>
  )
}
