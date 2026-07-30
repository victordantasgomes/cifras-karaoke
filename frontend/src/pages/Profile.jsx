import { useAuthStore } from '../store/authStore'

export default function Profile() {
  const user = useAuthStore((s) => s.user)
  return (
    <>
      <h1 className="page-title">Perfil</h1>
      <div className="page-sub">Sua conta neste dispositivo.</div>
      <div className="card" style={{ maxWidth: 420 }}>
        <div className="field"><label>Nome</label><div>{user?.name}</div></div>
        <div className="field"><label>Usuário</label><div>{user?.username}</div></div>
        <div className="field"><label>ID</label><div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{user?.id}</div></div>
      </div>
    </>
  )
}
