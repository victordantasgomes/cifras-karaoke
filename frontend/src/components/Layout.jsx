import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuthStore } from '../store/authStore'

export default function Layout() {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
