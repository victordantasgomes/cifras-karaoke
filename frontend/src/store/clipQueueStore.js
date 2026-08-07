import { create } from 'zustand'

/**
 * Cursor da fila de clipes curtos disparados por pedal (foot switch) — ver
 * SongEditor.jsx::ClipQueueSection pra upload/ordenação e
 * karaoke_service.py::payload pro @modopedal="fila_clipes". Estado local ao
 * palco de karaokê atual, não ao setlist (diferente de playlistStore) —
 * reseta a cada música carregada, ver load().
 */
export const useClipQueueStore = create((set, get) => ({
  slug: null,
  clips: [], // [{id, nome}]
  index: -1, // -1 = nada tocado ainda

  load: (slug, clips) => set({ slug, clips, index: -1 }),

  /** Avança pro próximo clipe da fila. Retorna o clipe ({id, nome}) a tocar,
   * ou null se a fila já acabou — nesse caso não faz nada (sem loop, pra não
   * repetir um clipe sem querer no meio de uma apresentação ao vivo). */
  advance: () => {
    const s = get()
    const next = s.index + 1
    if (next >= s.clips.length) return null
    set({ index: next })
    return s.clips[next]
  },
}))
