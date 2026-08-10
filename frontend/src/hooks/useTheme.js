import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'

export const THEMES = ['dark', 'light']
export const ACCENTS = ['azul', 'vermelho', 'verde', 'rosa', 'lilas', 'preto', 'branco', 'cinza']
export const DEFAULT_THEME = 'dark'
export const DEFAULT_ACCENT = 'azul'

const THEME_KEY = 'ck-theme'
const ACCENT_KEY = 'ck-accent'

function apply(theme, accent) {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.accent = accent
}

// aplicado uma vez, de imediato (fora de qualquer componente) — evita o
// flash do tema padrão antes do primeiro render, igual o detector de
// idioma do i18next já faz lendo o localStorage antes de tudo (ver i18n.js)
apply(localStorage.getItem(THEME_KEY) || DEFAULT_THEME, localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT)

/** Sincroniza tema/cor de destaque salvos em settings.prefs (usuário
 * logado) com o <html> — mesmo padrão de useLocale.js/useColorSettings.js.
 * Sem sessão, o valor já aplicado a partir do localStorage (acima) vale. */
export function useTheme() {
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
    const theme = data?.prefs?.theme
    const accent = data?.prefs?.accentColor
    if (!theme && !accent) return
    apply(theme || localStorage.getItem(THEME_KEY) || DEFAULT_THEME, accent || localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT)
    if (theme) localStorage.setItem(THEME_KEY, theme)
    if (accent) localStorage.setItem(ACCENT_KEY, accent)
  }, [data])
}

/** Força data-theme="light" enquanto o componente estiver montado,
 * restaurando o tema real do visitante (localStorage) ao desmontar — usado
 * só pela Landing.jsx, que é sempre clara independente da preferência do
 * app (mesmo raciocínio de .karaoke-stage forçar escuro: uma seção com
 * identidade visual própria, orientada por outro raciocínio de tema). */
export function useForceLightTheme() {
  useEffect(() => {
    const prevTheme = document.documentElement.dataset.theme
    apply('light', localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT)
    return () => apply(prevTheme || localStorage.getItem(THEME_KEY) || DEFAULT_THEME, localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT)
  }, [])
}

/** Troca tema/cor de destaque na hora (+ localStorage) e, se estiver
 * logado, persiste em settings.prefs — mesma forma de escrita do
 * PedalSettingsCard: preserva o resto de `prefs` espalhando antes de
 * gravar. Aceita trocar só um dos dois (o outro fica como está). */
export function useChangeTheme() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  return async ({ theme, accentColor }) => {
    const nextTheme = theme || localStorage.getItem(THEME_KEY) || DEFAULT_THEME
    const nextAccent = accentColor || localStorage.getItem(ACCENT_KEY) || DEFAULT_ACCENT
    apply(nextTheme, nextAccent)
    localStorage.setItem(THEME_KEY, nextTheme)
    localStorage.setItem(ACCENT_KEY, nextAccent)
    if (!token) return
    const current = qc.getQueryData(['settings'])
    const { data } = await api.put('/settings', {
      prefs: { ...current?.prefs, theme: nextTheme, accentColor: nextAccent },
    })
    qc.setQueryData(['settings'], data)
  }
}
