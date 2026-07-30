const WHITE_IN_OCTAVE = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 }
const BLACK_OFFSET_IN_OCTAVE = { 1: 0.68, 3: 1.68, 6: 3.62, 8: 4.58, 10: 5.55 }
const OCTAVES = 2
const WHITE_COUNT = OCTAVES * 7 + 1 // 15 — cobre qualquer inversão de acordes até 9ª
const WHITE_W = 15
const WHITE_H = 78
const BLACK_W = 9
const BLACK_H = 46

/**
 * Teclado de ~2 oitavas a partir da fundamental (`rootPc`), com as teclas de
 * `notes` (semitons acima de `rootPc` — ver buildPianoVoicings em
 * chordShapes.js) destacadas. `notes` já vem pronto pra indexar essa janela
 * direto: nenhuma rotação/transposição extra acontece aqui.
 */
export default function PianoDiagram({ rootPc, notes }) {
  const highlighted = new Set(notes)
  const whites = []
  const blacks = []

  for (let s = 0; s <= OCTAVES * 12; s++) {
    const pc = ((rootPc + s) % 12 + 12) % 12
    const octave = Math.floor(s / 12)
    if (WHITE_IN_OCTAVE[pc] != null) {
      const idx = octave * 7 + WHITE_IN_OCTAVE[pc]
      if (idx < WHITE_COUNT) whites.push({ idx, on: highlighted.has(s) })
    } else if (BLACK_OFFSET_IN_OCTAVE[pc] != null) {
      const center = octave * 7 + BLACK_OFFSET_IN_OCTAVE[pc]
      if (center < WHITE_COUNT - 1) blacks.push({ center, on: highlighted.has(s) })
    }
  }

  const width = WHITE_COUNT * WHITE_W

  return (
    <svg viewBox={`0 0 ${width} ${WHITE_H}`} width="100%" height="100%">
      {whites.map(({ idx, on }) => (
        <g key={`w-${idx}`}>
          <rect x={idx * WHITE_W} y={0} width={WHITE_W} height={WHITE_H}
            fill={on ? 'var(--amber-soft)' : '#fdfdfd'} stroke="#20222a" strokeWidth={1} />
          {on && <circle cx={idx * WHITE_W + WHITE_W / 2} cy={WHITE_H - 13} r={5} fill="var(--amber)" />}
        </g>
      ))}
      {blacks.map(({ center, on }, i) => (
        <g key={`b-${i}`}>
          <rect x={center * WHITE_W - BLACK_W / 2} y={0} width={BLACK_W} height={BLACK_H}
            fill={on ? 'var(--amber)' : '#111318'} stroke="#000" strokeWidth={0.5} />
          {on && <circle cx={center * WHITE_W} cy={BLACK_H - 10} r={3.5} fill="#fff" />}
        </g>
      ))}
    </svg>
  )
}
