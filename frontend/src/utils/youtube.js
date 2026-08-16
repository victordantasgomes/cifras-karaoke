/** Extrai o ID de 11 caracteres de uma URL do YouTube — null se a URL não
 * bater com nenhum formato conhecido. Usado tanto pelo mural da banda
 * (bandBoardShared.jsx) quanto pelo miniplayer do karaokê
 * (KaraokeStage.jsx/ScrollPlayer.jsx).
 *
 * Dois passos: primeiro os formatos com o ID direto no caminho da URL
 * (embed/, shorts/, youtu.be/ curto — inclui m.youtube.com, que contém
 * "youtube.com" como substring); depois, como fallback, qualquer
 * `?v=ID`/`&v=ID` em querystring — cobre o link de "watch" mesmo quando
 * `v=` não é o primeiro parâmetro (ex.: link de compartilhamento com
 * `?si=...&v=...` na frente). */
export function extractYoutubeId(url) {
  const str = String(url || '')
  const pathMatch = str.match(/(?:youtube\.com\/(?:embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)
  if (pathMatch) return pathMatch[1]
  const queryMatch = str.match(/[?&]v=([\w-]{11})/)
  return queryMatch ? queryMatch[1] : null
}

/** Monta a URL de embed pro `<iframe>` — sempre `youtube-nocookie.com` (não
 * `youtube.com`): o domínio normal herda a sessão do Google/YouTube já
 * logada no navegador, e cada player embutido novo conta como "mais um
 * dispositivo transmitindo" naquela conta (mensagem real do YouTube: "A
 * reprodução foi pausada porque há muitos dispositivos..." — aconteceu ao
 * trocar de música repetidas vezes numa playlist). O domínio "-nocookie"
 * (modo de privacidade oficial do YouTube) toca como visitante anônimo, sem
 * amarrar em conta nenhuma — a API postMessage funciona igual. `origin` é a
 * mitigação recomendada pelo Google pra evitar erro de configuração quando
 * `enablejsapi=1` está ligado. Usado tanto pelo miniplayer do karaokê
 * (YoutubeMiniPlayer.jsx) quanto pelo modal de sugestão (SongEditor.jsx). */
export function buildEmbedUrl(videoId, { autoplay = false } = {}) {
  const params = new URLSearchParams({
    enablejsapi: '1', rel: '0', origin: window.location.origin,
  })
  if (autoplay) params.set('autoplay', '1')
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`
}
