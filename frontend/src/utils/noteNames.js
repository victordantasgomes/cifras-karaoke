// Conversão nome-de-nota <-> classe de altura (0-11) — usado pra encaixar as
// notas já nomeadas do dicionário de acordes (CSV, ver ChordDictionary.jsx)
// no mesmo formato que PianoDiagram.jsx espera (semitons ascendentes a
// partir da fundamental, ver buildPianoVoicings em chordShapes.js).

const NOTE_TO_PC = {
  C: 0, 'B#': 0,
  'C#': 1, Db: 1,
  D: 2,
  'D#': 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, 'E#': 5,
  'F#': 6, Gb: 6,
  G: 7,
  'G#': 8, Ab: 8,
  A: 9,
  'A#': 10, Bb: 10,
  B: 11, Cb: 11,
}

export function noteNameToPc(name) {
  return NOTE_TO_PC[(name || '').trim()] ?? null
}

/**
 * Converte uma lista de notas já ordenada (grave -> agudo, ex.: vinda do
 * dicionário de acordes) em semitons ascendentes a partir de `rootPc` —
 * mesmo formato de `buildPianoVoicings` (chordShapes.js), pronto pra
 * `<PianoDiagram rootPc={...} notes={...} />`.
 */
export function notesToAscendingOffsets(rootPc, noteNames) {
  let prev = -1
  return noteNames.map((name) => {
    const pc = noteNameToPc(name)
    if (pc == null) return prev + 1
    let rel = ((pc - rootPc) % 12 + 12) % 12
    while (rel <= prev) rel += 12
    prev = rel
    return rel
  })
}
