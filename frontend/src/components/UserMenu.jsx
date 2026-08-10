import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../store/authStore'
import { IconUser, IconSettings, IconExit, IconChevronDown } from './icons'
import ProfileModal from './ProfileModal'

/** Botão de usuário no cluster fixo (Layout.jsx) — menu suspenso com
 * "Meu perfil" (abre o modal rico de conta), atalho pra Configurações e
 * Sair. Fecha ao clicar fora (sem lib externa de dropdown no projeto). */
export default function UserMenu() {
  const { t } = useTranslation('common')
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const initial = (user?.name || user?.username || '?').charAt(0).toUpperCase()

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="user-menu-avatar">{initial}</span>
        <IconChevronDown />
      </button>
      {open && (
        <div className="user-menu-panel">
          <button type="button" className="user-menu-item" onClick={() => { setProfileOpen(true); setOpen(false) }}>
            <IconUser /><span>{t('userMenu.myProfile')}</span>
          </button>
          <button type="button" className="user-menu-item" onClick={() => { navigate('/configuracoes'); setOpen(false) }}>
            <IconSettings /><span>{t('nav.settings')}</span>
          </button>
          <button type="button" className="user-menu-item danger" onClick={() => { logout(); navigate('/login') }}>
            <IconExit /><span>{t('nav.logout')}</span>
          </button>
        </div>
      )}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
