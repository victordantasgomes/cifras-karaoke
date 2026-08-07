import { useEffect, useRef, useState } from 'react'
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

function PedalSettingsCard() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const [listening, setListening] = useState(false)

  const save = useMutation({
    mutationFn: (pedalKey) => api.put('/settings', { prefs: { ...data?.prefs, pedalKey } }).then((r) => r.data),
    onSuccess: (d) => qc.setQueryData(['settings'], d),
  })

  useEffect(() => {
    if (!listening) return undefined
    const handler = (e) => {
      e.preventDefault()
      save.mutate(e.code)
      setListening(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening])

  const pedalKey = data?.prefs?.pedalKey

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>Pedal (foot switch)</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        Detecte a tecla que o seu pedal USB envia (a maioria dos pedais de
        foot switch se comporta como um teclado) — vale pra qualquer música
        com o modo de pedal ligado, configurado na aba Áudio do editor.
      </p>
      <div className="row" style={{ alignItems: 'center', gap: 12 }}>
        <span>Tecla atual: <strong>{pedalKey || 'nenhuma configurada'}</strong></span>
        <button className="btn primary" disabled={listening} onClick={() => setListening(true)}>
          {listening ? 'Aperte o pedal agora…' : 'Detectar tecla'}
        </button>
      </div>
    </div>
  )
}

function UserRow({ u, isSelf }) {
  const qc = useQueryClient()
  const [resetting, setResetting] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [rowError, setRowError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-users'] })

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/users/${u.id}`),
    onSuccess: invalidate,
    onError: (e) => setRowError(e.response?.data?.error || 'Não foi possível excluir o usuário.'),
  })

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/admin/users/${u.id}/reset-password`, { password: newPassword }),
    onSuccess: () => { setResetting(false); setNewPassword(''); setRowError('') },
    onError: (e) => setRowError(e.response?.data?.error || 'Não foi possível redefinir a senha.'),
  })

  return (
    <li style={{ padding: '10px 0', borderBottom: '1px solid var(--stroke)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span>
          {u.name} <span style={{ color: 'var(--muted)' }}>@{u.username}</span>
          {u.is_admin && <span className="tag" style={{ marginLeft: 8 }}>admin</span>}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => { setResetting(!resetting); setRowError('') }}>
            Redefinir senha
          </button>
          {!isSelf && (
            <button className="btn danger" disabled={remove.isPending}
              onClick={() => confirm(`Excluir o usuário ${u.username}? As músicas e setlists dele continuam existindo, só sem dono.`) && remove.mutate()}>
              {remove.isPending ? 'Excluindo…' : 'Excluir'}
            </button>
          )}
        </div>
      </div>
      <div className="page-sub" style={{ marginTop: 4 }}>
        {u.login_count} acesso(s) · último login: {u.last_login_at ? new Date(u.last_login_at).toLocaleString('pt-BR') : 'nunca'}
        {' · '}{u.setlists_count} setlist(s) · {u.favorites_count} favorita(s)
      </div>
      {resetting && (
        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <input className="input" type="password" placeholder="Nova senha (mín. 6 caracteres)"
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <button className="btn primary" disabled={!newPassword || resetPassword.isPending}
            onClick={() => resetPassword.mutate()}>
            {resetPassword.isPending ? 'Salvando…' : 'Confirmar'}
          </button>
        </div>
      )}
      {rowError && <div className="error-text" style={{ marginTop: 6 }}>{rowError}</div>}
    </li>
  )
}

function UserAdminCard() {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
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
        Área visível só para administradores — crie novas contas, redefina senhas e
        acompanhe o uso de cada uma. Tempo de permanência em tela ainda não é medido.
      </p>

      {users?.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
          {users.map((u) => <UserRow key={u.id} u={u} isSelf={u.id === currentUser?.id} />)}
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

function NormalizeLibraryCard() {
  const qc = useQueryClient()
  const { data: status } = useQuery({
    queryKey: ['admin-normalize-status'],
    queryFn: () => api.get('/admin/songs/normalize-status').then((r) => r.data),
  })
  const [running, setRunning] = useState(false)
  const [remaining, setRemaining] = useState(null)
  const [total, setTotal] = useState(null)
  const [error, setError] = useState('')
  const stopRef = useRef(false)

  useEffect(() => {
    if (status && remaining === null) { setRemaining(status.remaining); setTotal(status.remaining) }
  }, [status]) // eslint-disable-line

  const start = async () => {
    stopRef.current = false
    setRunning(true)
    setError('')
    // se for a primeira leva desde que a página carregou, o total da barra
    // é o "remaining" atual — retomar depois de parar não reinicia a barra
    let baseTotal = total ?? remaining
    if (baseTotal === null) baseTotal = 0
    try {
      while (!stopRef.current) {
        const { data } = await api.post('/admin/songs/normalize-batch', { limit: 50 })
        setRemaining(data.remaining)
        if (data.remaining > baseTotal) { baseTotal = data.remaining; setTotal(baseTotal) }
        if (data.processed === 0 || data.remaining === 0) break
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Falha ao normalizar em lote.')
    } finally {
      setRunning(false)
      qc.invalidateQueries({ queryKey: ['songs'] })
      qc.invalidateQueries({ queryKey: ['facets'] })
    }
  }
  const stop = () => { stopRef.current = true }

  const percent = total ? Math.round(((total - (remaining ?? total)) / total) * 100) : 0

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>Normalizar todo o acervo</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        Padroniza cabeçalho, notação de acordes e rótulos de seção de toda a
        biblioteca, música por música — processa em lotes pequenos direto do
        navegador (sem fila em segundo plano no servidor), então pode levar
        um tempo. Dá para parar e continuar depois: o progresso não se perde.
      </p>
      {remaining !== null && (
        <>
          <div style={{ background: 'var(--stroke)', borderRadius: 8, height: 10, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent, #46c48a)', transition: 'width .2s' }} />
          </div>
          <div className="page-sub" style={{ marginBottom: 14 }}>
            {remaining === 0 ? 'Todo o acervo está normalizado.' : `${remaining} música(s) restante(s) de ${total}`}
          </div>
        </>
      )}
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        {running ? (
          <button className="btn danger" onClick={stop}>Parar</button>
        ) : (
          <button className="btn primary" disabled={remaining === 0} onClick={start}>Iniciar</button>
        )}
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
      <PedalSettingsCard />
      {user?.is_admin && <UserAdminCard />}
      {user?.is_admin && <NormalizeLibraryCard />}
    </>
  )
}
