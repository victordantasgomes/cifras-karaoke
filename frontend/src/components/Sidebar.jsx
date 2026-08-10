import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logoHorizontal from '../assets/logo-horizontal.png'
import logoIcone from '../assets/logo-icone.png'
import { useAuthStore } from '../store/authStore'
import {
  IconHome, IconMusic, IconList, IconStar, IconClock,
  IconMic, IconBook, IconUsers, IconMetronome, IconTuner, IconShield, IconChart,
  IconSettings, IconUser, IconExit,
} from './icons'

const ITEMS = [
  { to: '/painel', labelKey: 'nav.dashboard', icon: IconHome, end: true },
  { to: '/musicas', labelKey: 'nav.songs', icon: IconMusic },
  { to: '/setlists', labelKey: 'nav.setlists', icon: IconList },
  { to: '/favoritas', labelKey: 'nav.favorites', icon: IconStar },
  { to: '/historico', labelKey: 'nav.history', icon: IconClock },
  { to: '/karaoke', labelKey: 'nav.karaoke', icon: IconMic },
  { to: '/dicionario-acordes', labelKey: 'nav.chordDictionary', icon: IconBook },
  { to: '/mural', labelKey: 'nav.bandBoard', icon: IconUsers },
  { section: 'nav.tools' },
  { to: '/metronomo', labelKey: 'nav.metronome', icon: IconMetronome },
  { to: '/afinador', labelKey: 'nav.tuner', icon: IconTuner },
  { to: '/admin/ferramenta', labelKey: 'nav.adminTools', icon: IconShield, adminOnly: true },
  { to: '/admin/vendas', labelKey: 'nav.adminSales', icon: IconChart, adminOnly: true },
  { to: '/configuracoes', labelKey: 'nav.settings', icon: IconSettings },
  { to: '/perfil', labelKey: 'nav.profile', icon: IconUser },
]

export default function Sidebar() {
  const { t } = useTranslation()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const visibleItems = ITEMS.filter((item) => !item.adminOnly || user?.is_admin)
  return (
    <aside className="sidebar no-print">
      <div className="brand">
        <img src={logoHorizontal} alt="Banda do Zé" className="brand-logo-full" />
        <img src={logoIcone} alt="Banda do Zé" className="brand-logo-icon" />
      </div>
      {visibleItems.map((item) => item.section ? (
        <div key={item.section} className="nav-section-label">{t(item.section)}</div>
      ) : (
        <NavLink key={item.to} to={item.to} end={item.end}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <item.icon /><span>{t(item.labelKey)}</span>
        </NavLink>
      ))}
      <div className="spacer" />
      <button className="nav-item" style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%' }}
        onClick={() => { logout(); navigate('/login') }}>
        <IconExit /><span>{t('nav.logout')}</span>
      </button>
    </aside>
  )
}
