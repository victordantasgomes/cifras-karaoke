import { create } from 'zustand'

/**
 * Estado da reprodução sequencial de um setlist ("tocar playlist").
 * Independente de música — sobrevive à navegação entre a página do setlist
 * (/setlists/:id) e o palco de karaokê (/karaoke/:slug), já que ambos vivem
 * na mesma SPA. Some num recarregamento manual da página, igual playerStore.
 */
export const usePlaylistStore = create((set, get) => ({
  setlistId: null,
  setlistNome: '',
  queue: [], // [{ ref, song }] — só itens já linkados a uma música real
  index: 0,
  active: false,

  start: (setlistId, setlistNome, queue, index = 0) =>
    set({ setlistId, setlistNome, queue, index, active: true }),

  stop: () => set({ active: false, index: 0 }),

  /** Avança para a próxima música. Retorna o slug dela, ou null se a playlist acabou (e já reseta). */
  advance: () => {
    const s = get()
    const next = s.index + 1
    if (next >= s.queue.length) {
      set({ active: false, index: 0 })
      return null
    }
    set({ index: next })
    return s.queue[next].song.slug
  },

  /** Volta para a música anterior. Retorna o slug dela, ou null se já é a primeira. */
  back: () => {
    const s = get()
    if (s.index <= 0) return null
    const prev = s.index - 1
    set({ index: prev })
    return s.queue[prev].song.slug
  },
}))
