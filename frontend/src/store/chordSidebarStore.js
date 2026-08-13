import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Largura e tamanho da fonte do assistente de acordes
 * (KaraokeChordSidebar.jsx) — largura ajustável arrastando a barra entre os
 * painéis, fonte ajustável pelos botões A−/A+ do rodapé da sidebar.
 * Persistido em localStorage (mesmo padrão de useZoomStore) — preferência
 * de leitura do usuário, não algo por música.
 */
export const MIN_WIDTH = 180
export const MAX_WIDTH = 480
const DEFAULT_WIDTH = 240

export const MIN_FONT_SCALE = 0.7
// teto alto de propósito: legibilidade > caber tudo — acima disso a coluna
// da sidebar já rola sozinha (ver .k-chord-sidebar-column em global.css),
// então não há razão técnica pra limitar mais cedo.
export const MAX_FONT_SCALE = 3.5
const FONT_SCALE_STEP = 0.15

export const useChordSidebarStore = create(
  persist(
    (set) => ({
      width: DEFAULT_WIDTH,
      setWidth: (w) => set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w))) }),
      fontScale: 1,
      increaseFontScale: () => set((s) => ({ fontScale: Math.min(MAX_FONT_SCALE, +(s.fontScale + FONT_SCALE_STEP).toFixed(2)) })),
      decreaseFontScale: () => set((s) => ({ fontScale: Math.max(MIN_FONT_SCALE, +(s.fontScale - FONT_SCALE_STEP).toFixed(2)) })),
    }),
    { name: 'ck-chord-sidebar' },
  ),
)
