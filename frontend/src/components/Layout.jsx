import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import ThemeToggle from './ThemeToggle'
import UserMenu from './UserMenu'
import { useAuthStore } from '../store/authStore'

export default function Layout() {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="top-right-fixed no-print">
        <UserMenu />
        <ThemeToggle />
      </div>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
