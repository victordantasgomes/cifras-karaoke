import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import logo from '../assets/logo-horizontal.png'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import ThemeToggle from '../components/ThemeToggle'
import { PostCard } from '../components/bandBoardShared'
import '../styles/landing.css'

/** Vitrine PÚBLICA do mural — qualquer visitante navega, sem login e sem
 * a sidebar do app (rota fora do <Layout>, ver App.jsx). Criar/editar/
 * gerenciar os próprios anúncios é feito em BandBoardManage.jsx, dentro
 * do shell autenticado — só faz sentido logado, então mora lá dentro. */
export default function BandBoard() {
  const { t } = useTranslation('bandBoard')
  const token = useAuthStore((s) => s.token)
  const { data: posts } = useQuery({ queryKey: ['band-board'], queryFn: () => api.get('/band-board').then((r) => r.data) })

  return (
    <div className="landing-page">
      <header className="landing-header no-print">
        <img src={logo} alt="Cifras Karaokê" className="landing-logo" />
        <div className="landing-header-actions">
          <ThemeToggle />
          {token ? (
            <>
              <Link to="/mural/meus-anuncios" className="btn primary">{t('myPosts')}</Link>
              <Link to="/painel" className="btn">{t('backToApp')}</Link>
            </>
          ) : (
            <>
              <Link to="/login" className="btn ghost">{t('login')}</Link>
              <Link to="/cadastro" className="btn primary">{t('signup')}</Link>
            </>
          )}
        </div>
      </header>

      <main className="landing-container" style={{ paddingTop: 108, paddingBottom: 60, paddingLeft: '6vw', paddingRight: '6vw' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 className="page-title">{t('title')}</h1>
          <div className="page-sub">{t('subtitle')}</div>
        </div>

        {!posts?.length && <div className="empty">{t('empty')}</div>}
        {posts?.map((p) => <PostCard key={p.id} post={p} mine={false} t={t} />)}
      </main>
    </div>
  )
}
