import { useEffect } from 'react'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

const PING_INTERVAL_MS = 50_000

/** Heartbeat de sessão (Fase 12) — alimenta o "tempo médio de acesso" do
 * painel admin (Fase 13). Só envia enquanto a aba está visível (Page
 * Visibility API), pra não inflar o tempo de sessão com abas em segundo
 * plano/minimizadas — o agrupamento em sessões acontece na leitura (ver
 * TelemetryService.group_into_sessions), não aqui. */
export function useActivityPing() {
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return undefined
    const tick = () => {
      if (document.visibilityState === 'visible') api.post('/telemetry/ping').catch(() => {})
    }
    tick()
    const id = setInterval(tick, PING_INTERVAL_MS)
    return () => clearInterval(id)
  }, [token])
}
