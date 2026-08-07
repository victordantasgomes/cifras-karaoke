import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

const SUBSCRIPTION_STATUS_LABELS = {
  none: 'Sem assinatura',
  trialing: 'Período de teste',
  active: 'Ativa',
  past_due: 'Pagamento pendente',
  canceled: 'Cancelada',
}

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

function BillingCard() {
  const { data: status } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => api.get('/billing/status').then((r) => r.data),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const abrirPortal = async () => {
    setBusy(true); setError('')
    try {
      const return_url = window.location.origin + '/configuracoes'
      const { data } = await api.get('/billing/portal-session', { params: { return_url } })
      window.location.href = data.url
    } catch (e) {
      setError(e.response?.data?.error || 'Não foi possível abrir o portal de cobrança.')
      setBusy(false)
    }
  }

  if (!status) return null

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>Assinatura</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        Status: <strong>{SUBSCRIPTION_STATUS_LABELS[status.subscription_status] || status.subscription_status}</strong>
        {status.plan_name && <> · plano <strong>{status.plan_name}</strong></>}
        {status.current_period_end && <> · renova em {new Date(status.current_period_end).toLocaleDateString('pt-BR')}</>}
      </p>
      {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="row" style={{ gap: 8 }}>
        {status.subscription_status === 'none' ? (
          <Link className="btn primary" to="/planos">Ver planos</Link>
        ) : (
          <button className="btn" disabled={busy} onClick={abrirPortal}>
            {busy ? 'Abrindo…' : 'Gerenciar assinatura'}
          </button>
        )}
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

function PlanRow({ plan }) {
  const qc = useQueryClient()
  const [maxSetlists, setMaxSetlists] = useState(plan.max_setlists)
  const [storageLimitMb, setStorageLimitMb] = useState(plan.storage_limit_mb)
  const [priceReais, setPriceReais] = useState((plan.price_cents / 100).toFixed(2))
  const [error, setError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-plans'] })

  const save = useMutation({
    mutationFn: () => api.put(`/admin/plans/${plan.id}`, {
      max_setlists: Number(maxSetlists),
      storage_limit_mb: Number(storageLimitMb),
      price_cents: Math.round(Number(priceReais) * 100),
    }),
    onSuccess: () => { invalidate(); setError('') },
    onError: (e) => setError(e.response?.data?.error || 'Não foi possível salvar.'),
  })

  const toggleActive = useMutation({
    mutationFn: () => api.post(`/admin/plans/${plan.id}/active`, { value: !plan.active }),
    onSuccess: invalidate,
  })

  return (
    <li style={{ padding: '10px 0', borderBottom: '1px solid var(--stroke)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>
          {plan.name}
          {!plan.active && <span className="tag" style={{ marginLeft: 8 }}>arquivado</span>}
        </strong>
        <button className="btn" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate()}>
          {plan.active ? 'Arquivar' : 'Reativar'}
        </button>
      </div>
      <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>Setlists (máx.)</label>
          <input className="input" type="number" min="0" value={maxSetlists}
            onChange={(e) => setMaxSetlists(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 160 }}>
          <label>Armazenamento (MB)</label>
          <input className="input" type="number" min="0" value={storageLimitMb}
            onChange={(e) => setStorageLimitMb(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>Preço mensal (R$)</label>
          <input className="input" type="number" min="0" step="0.01" value={priceReais}
            onChange={(e) => setPriceReais(e.target.value)} />
        </div>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      {error && <div className="error-text" style={{ marginTop: 6 }}>{error}</div>}
    </li>
  )
}

function PlansAdminCard() {
  const qc = useQueryClient()
  const { data: plans } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get('/admin/plans').then((r) => r.data),
  })
  const [form, setForm] = useState({ name: '', max_setlists: '', storage_limit_mb: '', price_reais: '' })
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: () => api.post('/admin/plans', {
      name: form.name,
      max_setlists: Number(form.max_setlists),
      storage_limit_mb: Number(form.storage_limit_mb),
      price_cents: Math.round(Number(form.price_reais || 0) * 100),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-plans'] })
      setForm({ name: '', max_setlists: '', storage_limit_mb: '', price_reais: '' })
      setError('')
    },
    onError: (e) => setError(e.response?.data?.error || 'Não foi possível criar o plano.'),
  })

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>Planos</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        Planos pagos do sistema — cada um define quantos setlists e quanto
        espaço de áudio um assinante tem direito. Criar um plano (ou editar o
        preço de um existente) sincroniza automaticamente um Produto/Preço na
        Stripe.
      </p>

      {plans?.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px' }}>
          {plans.map((p) => <PlanRow key={p.id} plan={p} />)}
        </ul>
      )}

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="field">
          <label>Nome</label>
          <input className="input" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex.: Hobby" />
        </div>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>Setlists (máx.)</label>
          <input className="input" type="number" min="0" value={form.max_setlists}
            onChange={(e) => setForm({ ...form, max_setlists: e.target.value })} />
        </div>
        <div className="field" style={{ maxWidth: 160 }}>
          <label>Armazenamento (MB)</label>
          <input className="input" type="number" min="0" value={form.storage_limit_mb}
            onChange={(e) => setForm({ ...form, storage_limit_mb: e.target.value })} />
        </div>
        <div className="field" style={{ maxWidth: 140 }}>
          <label>Preço mensal (R$)</label>
          <input className="input" type="number" min="0" step="0.01" value={form.price_reais}
            onChange={(e) => setForm({ ...form, price_reais: e.target.value })} />
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        <button className="btn primary" disabled={create.isPending || !form.name} onClick={() => create.mutate()}>
          {create.isPending ? 'Criando…' : 'Criar plano'}
        </button>
      </div>
    </div>
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

function StorageRecomputeCard() {
  const { data: status } = useQuery({
    queryKey: ['admin-storage-recompute-status'],
    queryFn: () => api.get('/admin/storage/recompute-status').then((r) => r.data),
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
    let baseTotal = total ?? remaining
    if (baseTotal === null) baseTotal = 0
    try {
      while (!stopRef.current) {
        const { data } = await api.post('/admin/storage/recompute-batch', { limit: 50 })
        setRemaining(data.remaining)
        if (data.remaining > baseTotal) { baseTotal = data.remaining; setTotal(baseTotal) }
        if (data.processed === 0 || data.remaining === 0) break
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Falha ao recalcular em lote.')
    } finally {
      setRunning(false)
    }
  }
  const stop = () => { stopRef.current = true }

  const percent = total ? Math.round(((total - (remaining ?? total)) / total) * 100) : 0

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginBottom: 12 }}>Recalcular tamanho dos arquivos de áudio</h3>
      <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
        Faixas e samples enviados antes desta versão não têm o tamanho
        registrado (uploads novos já gravam na hora) — preenche em lote via
        uma consulta de tamanho contra cada blob, sem baixar o áudio inteiro.
        Necessário pro cálculo de uso de armazenamento por plano.
      </p>
      {remaining !== null && (
        <>
          <div style={{ background: 'var(--stroke)', borderRadius: 8, height: 10, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent, #46c48a)', transition: 'width .2s' }} />
          </div>
          <div className="page-sub" style={{ marginBottom: 14 }}>
            {remaining === 0 ? 'Todos os arquivos já têm o tamanho registrado.' : `${remaining} arquivo(s) restante(s) de ${total}`}
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
      <BillingCard />
      {user?.is_admin && <UserAdminCard />}
      {user?.is_admin && <PlansAdminCard />}
      {user?.is_admin && <NormalizeLibraryCard />}
      {user?.is_admin && <StorageRecomputeCard />}
    </>
  )
}
