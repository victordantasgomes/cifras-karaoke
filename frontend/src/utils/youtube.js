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
