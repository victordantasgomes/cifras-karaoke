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

  /** Avança para a próxima música — pula o grupo de medley inteiro de uma vez
   * (ver SetlistDetail.jsx::buildMedleyItems/ScrollPlayer.jsx) quando a
   * música atual tem `medley_id`, em vez de parar no meio dele. Retorna o
   * slug do destino, ou null se a playlist acabou (e já reseta). */
  advance: () => {
    const s = get()
    const cur = s.queue[s.index]
    let next = s.index + 1
    if (cur?.medley_id) {
      while (next < s.queue.length && s.queue[next].medley_id === cur.medley_id) next += 1
    }
    if (next >= s.queue.length) {
      set({ active: false, index: 0 })
      return null
    }
    set({ index: next })
    return s.queue[next].song.slug
  },

  /** Volta pra música (ou início do grupo de medley) anterior. Retorna o
   * slug dela, ou null se já é a primeira. */
  back: () => {
    const s = get()
    if (s.index <= 0) return null
    let prev = s.index - 1
    const prevGroupId = s.queue[prev].medley_id
    if (prevGroupId) {
      while (prev > 0 && s.queue[prev - 1].medley_id === prevGroupId) prev -= 1
    }
    set({ index: prev })
    return s.queue[prev].song.slug
  },
}))
