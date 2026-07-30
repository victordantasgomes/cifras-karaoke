import { create } from 'zustand'
import { groupIntoSteps } from '../utils/steps'

/**
 * Estado do player karaokê (janela de múltiplos passos).
 * `audioMode` liga quando a música tem faixa de referência enviada OU
 * quando ela pode tocar com acompanhamento sintetizado (`synthMode`) — nos
 * dois casos o avanço é sincronizado a um relógio real (ver
 * hooks/useAudioSync.js), em vez do cronômetro fixo de `msPerLine` usado
 * quando nenhum dos dois está disponível. `hasAudio` distingue qual dos
 * dois é: só ele decide se `KaraokePlayer.jsx` monta um `<audio>` real ou
 * um `SynthClock` (ver utils/synthClock.js) — o acompanhamento sintetizado
 * nunca assume o palco por cima de uma gravação de verdade.
 *
 * `index` é um índice de PASSO (`steps`, ver utils/steps.js), não de linha
 * crua — uma linha de acorde imediatamente seguida da letra correspondente
 * vira um único passo, pra as duas sempre avançarem/realçarem juntas.
 * `lines` (flat, uma entrada por linha do arquivo) é mantido só de
 * referência; nada navega por ele.
 */
export const usePlayerStore = create((set, get) => ({
  lines: [],
  steps: [],
  index: 0,
  playing: false,
  msPerLine: 3000,
  meta: {},
  audioMode: false,
  hasAudio: false,
  synthMode: false,
  bpm: null,
  instrumentos: null,
  samples: [],

  load: (payload) =>
    set({
      lines: payload.lines,
      steps: groupIntoSteps(payload.lines),
      meta: payload,
      msPerLine: payload.ms_per_line,
      index: 0,
      playing: false,
      audioMode: Boolean(payload.has_audio) || Boolean(payload.synth_ready),
      hasAudio: Boolean(payload.has_audio),
      synthMode: !payload.has_audio && Boolean(payload.synth_ready),
      bpm: payload.bpm,
      instrumentos: payload.instrumentos,
      samples: payload.samples || [],
    }),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  toggle: () => set((s) => ({ playing: !s.playing })),
  restart: () => set({ index: 0, playing: false }),
  next: () =>
    set((s) => ({ index: Math.min(s.index + 1, Math.max(0, s.steps.length - 1)) })),
  prev: () => set((s) => ({ index: Math.max(0, s.index - 1) })),
  setIndex: (i) => set({ index: i }),
  faster: () => set((s) => ({ msPerLine: Math.max(300, Math.round(s.msPerLine * 0.85)) })),
  slower: () => set((s) => ({ msPerLine: Math.min(15000, Math.round(s.msPerLine * 1.18)) })),
  atEnd: () => get().index >= get().steps.length - 1,
}))
