// mesma tabela cromática de backend/utils/transpose.py::SHARPS/_NOTE_INDEX —
// replicada aqui (12 linhas) pra uso client-side (ordenação por tom em
// PlaylistOrderModal.jsx, cálculo de semitons do medley em ScrollPlayer.jsx)
// sem precisar de round-trip ao backend só pra essa conta.
const NOTE_INDEX = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}
const ROOT_RE = /^([A-G][#b]?)/

/** Índice cromático (0-11) da nota fundamental de um tom (ex.: "F#m" -> 6);
 * null se não reconhecido/vazio. */
export function keyIndex(tom) {
  const m = (tom || '').match(ROOT_RE)
  return m ? (NOTE_INDEX[m[1]] ?? null) : null
}

/** Semitons pra ir de `fromTom` até `toTom` (0-11, sempre "pra frente" —
 * mesma convenção de backend/utils/transpose.py::semitones_between). null
 * se qualquer um dos dois tons não for reconhecido. */
export function semitonesBetween(fromTom, toTom) {
  const a = keyIndex(fromTom)
  const b = keyIndex(toTom)
  if (a == null || b == null) return null
  return (b - a + 12) % 12
}
