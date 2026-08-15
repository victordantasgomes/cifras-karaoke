/** Extrai o ID de 11 caracteres de uma URL do YouTube (watch/embed/youtu.be
 * curto) — null se a URL não bater com nenhum desses formatos. Usado tanto
 * pelo mural da banda (bandBoardShared.jsx) quanto pelo miniplayer do
 * karaokê (KaraokeStage.jsx/ScrollPlayer.jsx). */
export function extractYoutubeId(url) {
  const match = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  )
  return match ? match[1] : null
}
