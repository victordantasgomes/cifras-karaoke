import { useAuthStore } from '../store/authStore'

/** '' quando logado (rotas autenticadas de sempre), '/public' quando
 * anônimo (rotas novas /public/*, sem @protected — ver plano da página
 * principal pública). Usado por KaraokePlayer/KaraokeStage/ScrollPlayer
 * pra funcionar tanto dentro do app quanto a partir de /cifra/:slug sem
 * duplicar nenhum dos dois players. */
export function usePublicApiBase() {
  const token = useAuthStore((s) => s.token)
  return token ? '' : '/public'
}
