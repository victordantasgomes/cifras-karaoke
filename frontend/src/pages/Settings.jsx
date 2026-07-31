import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

const COLOR_FIELDS = [
  { key: 'sweepSung', label: 'Letra já cantada' },
  { key: 'sweepUpcoming', label: 'Letra por vir' },
  { key: 'amber', label: 'Acordes / seções' },
  { key: 'sample', label: 'Sample / solo automático' },
  { key: 'ok', label: 'Solo / riff / tablatura' },
]

// espelha services/settings_service.py::DEFAULT_COLORS — usado só pelo
// botão "Restaurar padrão" (não precisa ir ao servidor pra isso)
const DEFAULT_COLORS = {
  sweepSung: '#f2b544',
  sweepUpcoming: '#ffffff',
  amber: '#f2b544',
  sample: '#6fa8ff',
  ok: '#46c48a',
}

function ColorSettingsCard() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [colors, setColors] = useState(null)
  useEffect(() => { if (data?.colors && !colors) setColors(data.colors) }, [data]) // eslint-disable-line

  const save = useMutation({
    mutationFn: (next) => api.put('/settings', { colors: next }).then((r) => r.data),
    onSuccess: (d) => { setColors(d.colors); qc.setQueryData(['settings'], d) },
  })

  const restoreDefaults = () => setColors(DEFAULT_COLORS)

  if (!colors) return null

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>Cores do karaokê</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        Paleta usada no palco de karaokê e na folha de cifra — vale para todas as músicas.
      </p>
      <div className="row" style={{ gap: 20, marginBottom: 14 }}>
        {COLOR_FIELDS.map(({ key, label }) => (
          <div key={key} style={{ textAlign: 'center' }}>
            <input type="color" value={colors[key] || '#000000'}
              style={{ width: 46, height: 34, padding: 0, border: '1px solid var(--stroke)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}
              onChange={(e) => setColors({ ...colors, [key]: e.target.value })} />
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, maxWidth: 100 }}>{label}</div>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate(colors)}>
          {save.isPending ? 'Salvando…' : 'Salvar cores'}
        </button>
        <button className="btn" onClick={restoreDefaults}>Restaurar padrão</button>
      </div>
    </div>
  )
}

function UserAdminCard() {
  const qc = useQueryClient()
  const { data: users } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then((r) => r.data),
  })
  const [form, setForm] = useState({ username: '', password: '', name: '', is_admin: false })
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: (payload) => api.post('/admin/users', payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setForm({ username: '', password: '', name: '', is_admin: false })
      setError('')
    },
    onError: (e) => setError(e.response?.data?.error || 'Não foi possível criar o usuário.'),
  })

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>Administração de usuários</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        Área visível só para administradores — crie novas contas de acesso ao sistema.
      </p>

      {users?.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
          {users.map((u) => (
            <li key={u.id} className="row"
              style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--stroke)' }}>
              <span>{u.name} <span style={{ color: 'var(--muted)' }}>@{u.username}</span></span>
              {u.is_admin && <span className="tag">admin</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="field">
        <label>Nome</label>
        <input className="input" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="field">
        <label>Usuário</label>
        <input className="input" value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })} />
      </div>
      <div className="field">
        <label>Senha</label>
        <input className="input" type="password" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </div>
      <label className="row" style={{ gap: 8, alignItems: 'center', margin: '4px 0 14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={form.is_admin}
          onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
        Administrador
      </label>
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        <button className="btn primary" disabled={create.isPending} onClick={() => create.mutate(form)}>
          {create.isPending ? 'Criando…' : 'Criar usuário'}
        </button>
      </div>
    </div>
  )
}

export default function Settings() {
  const user = useAuthStore((s) => s.user)
  return (
    <>
      <h1 className="page-title">Configurações</h1>
      <div className="page-sub">Preferências visuais.</div>
      <ColorSettingsCard />
      {user?.is_admin && <UserAdminCard />}
    </>
  )
}
