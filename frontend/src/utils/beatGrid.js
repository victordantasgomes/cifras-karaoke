// Grade de batidas do acompanhamento sintetizado (ver utils/bandSynth.js),
// assumindo compasso 4/4. O sintetizador É o próprio relógio da
// apresentação (não precisa ficar em fase com nenhuma gravação real), então
// fixar a batida 1 em t=0 é uma escolha correta, não uma aproximação.

/**
 * @param {number} bpm
 * @param {number} duration segundos
 * @param {number} beatsPerBar
 * @returns {{beatDur:number, beats:{t:number, isDownbeat:boolean}[]}}
 */
export function buildBeatGrid(bpm, duration, beatsPerBar = 4) {
  const beatDur = 60 / Math.max(1, bpm)
  const beats = []
  for (let t = 0, i = 0; t <= duration; t += beatDur, i++) {
    beats.push({ t, isDownbeat: i % beatsPerBar === 0 })
  }
  return { beatDur, beats }
}
