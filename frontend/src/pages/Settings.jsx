import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'

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

export default function Settings() {
  return (
    <>
      <h1 className="page-title">Configurações</h1>
      <div className="page-sub">Preferências visuais.</div>
      <ColorSettingsCard />
    </>
  )
}
