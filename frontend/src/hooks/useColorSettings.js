import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

// chave salva no backend -> variável CSS que ela sobrescreve em :root
const CSS_VAR_BY_KEY = {
  sweepSung: '--sweep-sung',
  sweepUpcoming: '--sweep-upcoming',
  amber: '--amber',
  sample: '--sample',
  ok: '--ok',
}

/** Busca a paleta salva pelo usuário e aplica como variáveis CSS na raiz —
 * único lugar que precisa saber disso, já que todo o resto do app (palco de
 * karaokê, folha de cifra) já lê essas variáveis. */
export function useColorSettings() {
  const token = useAuthStore((s) => s.token)
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    enabled: Boolean(token),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    if (!data?.colors) return
    for (const [key, cssVar] of Object.entries(CSS_VAR_BY_KEY)) {
      const value = data.colors[key]
      if (value) document.documentElement.style.setProperty(cssVar, value)
    }
  }, [data])
}
