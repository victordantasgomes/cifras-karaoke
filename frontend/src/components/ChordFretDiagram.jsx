import { assignFingers } from '../utils/chordShapes'

const ROWS = 5 // acomoda o maior span tocável considerado (ver MAX_SPAN em chordShapes.js)
const W = 110
const TOP = 20 // espaço pros marcadores × / o acima do braço
const SIDE = 8
const FRET_AREA_H = 110
const TUNING_Y = TOP + FRET_AREA_H + 14

/** Deriva a pestana (se houver) direto de `frets`/`fingers`: um dedo que
 * aparece em 2+ cordas SÓ é uma pestana válida se todas essas cordas
 * estiverem na MESMA casa — caso contrário os dados são inconsistentes (o
 * mesmo dedo não pode estar em duas casas ao mesmo tempo) e não desenhamos
 * nada, pra não sugerir uma pestana que não existe. */
function findBarre(frets, fingers) {
  const strandsByFinger = new Map()
  frets.forEach((f, i) => {
    const finger = fingers[i]
    if (f == null || f === 0 || !finger) return
    if (!strandsByFinger.has(finger)) strandsByFinger.set(finger, [])
    strandsByFinger.get(finger).push({ i, f })
  })
  for (const strands of strandsByFinger.values()) {
    if (strands.length < 2) continue
    const frets_ = new Set(strands.map((s) => s.f))
    if (frets_.size !== 1) continue
    const idxs = strands.map((s) => s.i)
    return { fret: strands[0].f, from: Math.min(...idxs), to: Math.max(...idxs) }
  }
  return null
}

/**
 * Diagrama de braço genérico (violão de 6 cordas ou ukulelê de 4) — traste
 * grosso quando a formação começa no traste 1, ou número do traste inicial
 * ("3fr") quando começa mais acima. × acima da corda = abafada, o = solta,
 * bolinha numerada = dedo; quando o mesmo dedo cobre 2+ cordas na mesma
 * casa, uma barra conecta as bolinhas pra indicar a pestana (ver
 * findBarre — derivada de `frets`/`fingers`, não de um prop separado).
 * `fingers` é opcional — quando ausente, é derivado de `frets` via
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
  const barre = findBarre(frets, fingers)

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

      {/* traste (nut) grosso quando a formação começa no traste 1, ou rótulo do traste inicial */}
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

      {/* barra da pestana, ligando as cordas cobertas pelo mesmo dedo na mesma casa */}
      {barre && (() => {
        const row = barre.fret - baseFret + 1
        if (row < 1 || row > ROWS) return null
        const cy = rowY(row - 1) + FRET_AREA_H / ROWS / 2
        const xs = [stringX(barre.from), stringX(barre.to)]
        const x1 = Math.min(...xs)
        const x2 = Math.max(...xs)
        return <rect x={x1 - 7} y={cy - 7} width={x2 - x1 + 14} height={14} rx={7} fill="var(--amber)" opacity={0.35} />
      })()}

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
