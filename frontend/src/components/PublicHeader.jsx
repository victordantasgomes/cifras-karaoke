import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import BrandLogo from './BrandLogo'
import { useAuthStore } from '../store/authStore'
import ThemeToggle from './ThemeToggle'

/** Cabeçalho leve usado por PublicSongView.jsx — mesmo padrão já usado no
 * cabeçalho inline de BandBoard.jsx (rota pública, fora do <Layout>/sidebar
 * autenticado). Ao contrário da landing.css/About.jsx, respeita o tema real
 * do visitante (claro/escuro + cor de destaque) em vez de forçar claro. */
export default function PublicHeader({ children }) {
  const { t } = useTranslation('bandBoard')
  const token = useAuthStore((s) => s.token)

  return (
    <header className="landing-header no-print">
      <Link to="/"><BrandLogo className="landing-logo" /></Link>
      <div className="landing-header-actions">
        {children}
        <ThemeToggle />
        {token ? (
          <Link to="/painel" className="btn">{t('backToApp')}</Link>
        ) : (
          <>
            <Link to="/login" className="btn ghost">{t('login')}</Link>
            <Link to="/cadastro" className="btn primary">{t('signup')}</Link>
          </>
        )}
      </div>
    </header>
  )
}
