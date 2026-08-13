import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Largura do assistente de acordes (KaraokeChordSidebar.jsx), ajustável
 * arrastando a barra entre os painéis. Persistido em localStorage (mesmo
 * padrão de useZoomStore) — preferência de leitura do usuário, não algo
 * por música.
 */
export const MIN_WIDTH = 180
export const MAX_WIDTH = 480
const DEFAULT_WIDTH = 240

export const useChordSidebarStore = create(
  persist(
    (set) => ({
      width: DEFAULT_WIDTH,
      setWidth: (w) => set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w))) }),
    }),
    { name: 'ck-chord-sidebar-width' },
  ),
)
