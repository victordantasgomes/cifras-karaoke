// "Ouvir acorde" no dicionário de acordes — não é MIDI de verdade, mas
// cumpre o mesmo papel (README anexado pede "reprodução MIDI"): osciladores
// de Web Audio tocando as notas reais do voicing selecionado, com um
// dedilhado curto entre as cordas pra soar como um acorde, não um acúmulo
// de tons simultâneos idênticos.

let ctx = null
function getCtx() {
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  return ctx
}

const midiToFreq = (midi) => 440 * 2 ** ((midi - 69) / 12)

export function playChordNotes(midiNotes, { duration = 1.6, strum = 0.03 } = {}) {
  const audioCtx = getCtx()
  if (!audioCtx || !midiNotes.length) return
  if (audioCtx.state === 'suspended') audioCtx.resume()
  const now = audioCtx.currentTime
  midiNotes.forEach((midi, i) => {
    const start = now + i * strum
    const osc = audioCtx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = midiToFreq(midi)
    const gain = audioCtx.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.16, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.05)
  })
}

export const GUITAR_OPEN_MIDI = [40, 45, 50, 55, 59, 64] // E2 A2 D3 G3 B3 E4
export const UKULELE_OPEN_MIDI = [67, 60, 64, 69] // G4 C4 E4 A4 (reentrante)

/** `frets[i]` = casa pressionada na corda `i` (0 = solta) ou null (abafada). */
export function stringVoicingToMidi(frets, openMidi) {
  return frets.map((f, i) => (f == null ? null : openMidi[i] + f)).filter((m) => m != null)
}

/** `offsets` = semitons ascendentes a partir da fundamental (ver
 * utils/noteNames.js::notesToAscendingOffsets) — dó central como referência. */
export function pianoVoicingToMidi(rootPc, offsets) {
  return offsets.map((o) => 60 + rootPc + o)
}
