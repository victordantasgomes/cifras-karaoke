import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Tamanho do miniplayer do YouTube no karaokê (KaraokeStage.jsx/
 * ScrollPlayer.jsx) — ajustável arrastando a alça no canto inferior
 * esquerdo (ver YoutubeMiniPlayer.jsx), mesmo padrão de persistência em
 * localStorage do useChordSidebarStore. Largura e altura guardadas
 * separadamente (não travadas em 16:9) — o usuário pode preferir uma caixa
 * mais quadrada ou mais larga conforme o espaço livre ao lado da sidebar.
 */
export const MIN_WIDTH = 160
export const MAX_WIDTH = 480
export const MIN_HEIGHT = 90
export const MAX_HEIGHT = 360
const DEFAULT_WIDTH = 220
const DEFAULT_HEIGHT = Math.round((DEFAULT_WIDTH * 9) / 16)

export const useYoutubeMiniPlayerStore = create(
  persist(
    (set) => ({
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      setSize: (w, h) => set({
        width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w))),
        height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(h))),
      }),
    }),
    { name: 'ck-youtube-mini-player' },
  ),
)
