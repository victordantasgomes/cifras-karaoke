import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

/** Sincroniza o idioma salvo em settings.prefs.locale (usuário logado) com
 * o i18next — mesmo padrão de useColorSettings.js. Sem sessão, o i18next já
 * escolheu um idioma sozinho (localStorage salvo antes, ou sugestão do
 * navegador — ver detection em i18n.js), então não tem nada a fazer aqui;
 * a preferência do servidor só "vence" quando existe e a pessoa está
 * logada, pra não perder a escolha entre dispositivos diferentes. */
export function useLocale() {
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
    const saved = data?.prefs?.locale
    if (saved && saved !== i18n.language) i18n.changeLanguage(saved)
  }, [data])
}

/** Troca o idioma na hora (i18next + localStorage, via detector) e, se
 * estiver logado, persiste em settings.prefs.locale — mesma forma de
 * escrita do PedalSettingsCard: preserva o resto de `prefs` espalhando
 * antes de gravar. */
export function useChangeLocale() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  return async (locale) => {
    await i18n.changeLanguage(locale)
    if (!token) return
    const current = qc.getQueryData(['settings'])
    const { data } = await api.put('/settings', { prefs: { ...current?.prefs, locale } })
    qc.setQueryData(['settings'], data)
  }
}
