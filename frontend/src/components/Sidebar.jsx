import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import logoHorizontal from '../assets/logo-horizontal.png'
import logoIcone from '../assets/logo-icone.png'
import { useAuthStore } from '../store/authStore'
import {
  IconHome, IconMusic, IconList, IconStar, IconClock,
  IconMic, IconBook, IconSettings, IconUser, IconExit,
} from './icons'

const ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', icon: IconHome, end: true },
  { to: '/musicas', labelKey: 'nav.songs', icon: IconMusic },
  { to: '/setlists', labelKey: 'nav.setlists', icon: IconList },
  { to: '/favoritas', labelKey: 'nav.favorites', icon: IconStar },
  { to: '/historico', labelKey: 'nav.history', icon: IconClock },
  { to: '/karaoke', labelKey: 'nav.karaoke', icon: IconMic },
  { to: '/dicionario-acordes', labelKey: 'nav.chordDictionary', icon: IconBook },
  { to: '/configuracoes', labelKey: 'nav.settings', icon: IconSettings },
  { to: '/perfil', labelKey: 'nav.profile', icon: IconUser },
]

export default function Sidebar() {
  const { t } = useTranslation()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  return (
    <aside className="sidebar no-print">
      <div className="brand">
        <img src={logoHorizontal} alt="Banda do Zé" className="brand-logo-full" />
        <img src={logoIcone} alt="Banda do Zé" className="brand-logo-icon" />
      </div>
      {ITEMS.map(({ to, labelKey, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Icon /><span>{t(labelKey)}</span>
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
