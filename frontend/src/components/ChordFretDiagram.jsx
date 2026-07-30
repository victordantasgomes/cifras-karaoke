import { assignFingers } from '../utils/chordShapes'

const ROWS = 5 // acomoda o maior span tocável considerado (ver MAX_SPAN em chordShapes.js)
const W = 110
const TOP = 20 // espaço pros marcadores × / o acima do braço
const SIDE = 8
const FRET_AREA_H = 110
const TUNING_Y = TOP + FRET_AREA_H + 14

/**
 * Diagrama de braço genérico (violão de 6 cordas ou ukulelê de 4) — pestana
 * grossa no traste 1, ou número do traste inicial ("3fr") quando a formação
 * começa mais acima. × acima da corda = abafada, o = solta, bolinha numerada
 * = dedo. `fingers` é opcional — quando ausente, é derivado de `frets` via
 * assignFingers (ver chordShapes.js); o dicionário de acordes (dados
 * curados) sempre passa os dedos do próprio registro.
 *
 * `mirror` inverte a ORDEM de desenho das cordas (não os dados) — é o modo
 * canhoto: a corda mais grave passa a ficar à direita, sem espelhar o
 * texto dos números/rótulos (que ficariam ilegíveis com um `transform:
 * scaleX(-1)` ingênuo).
 */
export default function ChordFretDiagram({ frets, baseFret, strings, fingers: fingersProp, tuning, mirror = false }) {
  const H = tuning ? 150 : 130
  const pos = (i) => (mirror ? strings - 1 - i : i)
  const stringX = (i) => SIDE + (pos(i) * (W - 2 * SIDE)) / (strings - 1)
  const rowY = (row) => TOP + (row * FRET_AREA_H) / ROWS
  const fingers = fingersProp || assignFingers(frets)
  const firstX = SIDE
  const lastX = W - SIDE

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
      {/* marcadores × / o acima do braço */}
      {frets.map((f, i) => {
        const label = f == null ? '×' : f === 0 ? 'o' : ''
        if (!label) return null
        return (
          <text key={`m-${i}`} x={stringX(i)} y={TOP - 7} textAnchor="middle" fontSize="11"
            fill={f == null ? 'var(--muted)' : 'var(--text)'}>{label}</text>
        )
      })}

      {/* pestana (traste 1) ou rótulo do traste inicial */}
      {baseFret === 1 ? (
        <rect x={firstX} y={rowY(0) - 2} width={lastX - firstX} height={3} fill="var(--text)" />
      ) : (
        <text x={lastX + 9} y={rowY(0) + FRET_AREA_H / ROWS / 2 + 4} fontSize="9.5" fill="var(--muted)">
          {baseFret}fr
        </text>
      )}

      {/* linhas dos trastes */}
      {Array.from({ length: ROWS + 1 }, (_, r) => (
        <line key={`fret-${r}`} x1={firstX} x2={lastX} y1={rowY(r)} y2={rowY(r)}
          stroke="var(--stroke)" strokeWidth={r === 0 && baseFret === 1 ? 0 : 1} />
      ))}

      {/* cordas */}
      {Array.from({ length: strings }, (_, i) => (
        <line key={`str-${i}`} x1={stringX(i)} x2={stringX(i)} y1={rowY(0)} y2={rowY(ROWS)} stroke="var(--stroke)" strokeWidth={1} />
      ))}

      {/* afinação (grave → agudo, já na orientação exibida) */}
      {tuning && tuning.map((note, i) => (
        <text key={`t-${i}`} x={stringX(i)} y={TUNING_Y} textAnchor="middle" fontSize="9.5" fill="var(--muted)">
          {note}
        </text>
      ))}

      {/* dedos */}
      {frets.map((f, i) => {
        if (f == null || f === 0) return null
        const row = f - baseFret + 1
        if (row < 1 || row > ROWS) return null // formação fora da janela visível (defensivo)
        const cy = rowY(row - 1) + FRET_AREA_H / ROWS / 2
        return (
          <g key={`dot-${i}`}>
            <circle cx={stringX(i)} cy={cy} r={7} fill="var(--amber)" />
            <text x={stringX(i)} y={cy + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#17130a">
              {fingers[i] || ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
