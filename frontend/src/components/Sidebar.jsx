import { NavLink, useNavigate } from 'react-router-dom'
import logoHorizontal from '../assets/logo-horizontal.png'
import logoIcone from '../assets/logo-icone.png'
import { useAuthStore } from '../store/authStore'
import {
  IconHome, IconMusic, IconList, IconStar, IconClock,
  IconMic, IconBook, IconSettings, IconUser, IconExit,
} from './icons'

const ITEMS = [
  { to: '/', label: 'Dashboard', icon: IconHome, end: true },
  { to: '/musicas', label: 'Minhas músicas', icon: IconMusic },
  { to: '/setlists', label: 'Setlists', icon: IconList },
  { to: '/favoritas', label: 'Favoritas', icon: IconStar },
  { to: '/historico', label: 'Histórico', icon: IconClock },
  { to: '/karaoke', label: 'Karaokê', icon: IconMic },
  { to: '/dicionario-acordes', label: 'Dicionário de acordes', icon: IconBook },
  { to: '/configuracoes', label: 'Configurações', icon: IconSettings },
  { to: '/perfil', label: 'Perfil', icon: IconUser },
]

export default function Sidebar() {
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  return (
    <aside className="sidebar no-print">
      <div className="brand">
        <img src={logoHorizontal} alt="Banda do Zé" className="brand-logo-full" />
        <img src={logoIcone} alt="Banda do Zé" className="brand-logo-icon" />
      </div>
      {ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Icon /><span>{label}</span>
        </NavLink>
      ))}
      <div className="spacer" />
      <button className="nav-item" style={{ border: 'none', background: 'none', cursor: 'pointer', width: '100%' }}
        onClick={() => { logout(); navigate('/login') }}>
        <IconExit /><span>Sair</span>
      </button>
    </aside>
  )
}
