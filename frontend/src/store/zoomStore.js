import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Nível de zoom do texto na tela de execução do karaokê (modo rolagem —
 * ScrollPlayer.jsx — e modo karaoke — KaraokeStage.jsx). Persistido em
 * localStorage (mesmo padrão do authStore) pra sobreviver à troca de
 * música — é uma preferência de leitura do usuário, não algo por música.
 */
const MIN_ZOOM = 0.6
const MAX_ZOOM = 2
const STEP = 0.1

export const useZoomStore = create(
  persist(
    (set) => ({
      zoom: 1,
      zoomIn: () => set((s) => ({ zoom: Math.min(MAX_ZOOM, +(s.zoom + STEP).toFixed(2)) })),
      zoomOut: () => set((s) => ({ zoom: Math.max(MIN_ZOOM, +(s.zoom - STEP).toFixed(2)) })),
    }),
    { name: 'ck-karaoke-zoom' },
  ),
)
