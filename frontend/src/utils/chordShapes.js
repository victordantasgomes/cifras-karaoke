// Gera diagramas de acorde (violão, ukulelê, teclado) a partir do símbolo já
// reconhecido por chordParser.js (root, quality, intervals, bass).
//
// Busca por força bruta nas cordas: cada corda cobre exatamente uma oitava
// (trastes 0-11), então pra cada classe de altura do acorde existe NO MÁXIMO
// um traste por corda que a produz — o espaço de busca fica pequeno o
// bastante pra rodar a cada hover sem travar a UI (ver buildFretVoicings).

export const GUITAR_TUNING = [4, 9, 2, 7, 11, 4]   // E A D G B E (grave -> aguda)
export const UKULELE_TUNING = [7, 0, 4, 9]         // G C E A (reentrante, padrão)

const MAX_FRET = 11 // uma oitava inteira por corda
const MAX_SPAN = 4  // maior alcance (span) entre trastes considerado tocável

/** Classes de altura (0-11) do acorde, a partir do {root, intervals} de parseChordSymbol. */
export function chordPitchClasses(parsed) {
  return new Set(parsed.intervals.map((i) => ((parsed.root + i) % 12 + 12) % 12))
}

function fretChoicesForString(openPc, pcs) {
  const choices = [null] // corda solta/abafada (não toca)
  for (let f = 0; f <= MAX_FRET; f++) {
    if (pcs.has((openPc + f) % 12)) choices.push(f)
  }
  return choices
}

/** Produto cartesiano das opções de cada corda. */
function* product(arrays) {
  if (arrays.length === 0) { yield []; return }
  const [first, ...rest] = arrays
  for (const restCombo of product(rest)) {
    for (const val of first) yield [val, ...restCombo]
  }
}

function fretSpan(frets) {
  const fretted = frets.filter((f) => f != null && f > 0)
  if (!fretted.length) return 0
  return Math.max(...fretted) - Math.min(...fretted)
}

function scoreVoicing(frets, tuning, rootPc, bassPc) {
  const soundedIdx = frets.map((f, i) => (f == null ? -1 : i)).filter((i) => i >= 0)
  const sounded = soundedIdx.map((i) => (tuning[i] + frets[i]) % 12)
  const distinctCovered = new Set(sounded).size
  const mutedCount = frets.filter((f) => f == null).length
  const span = fretSpan(frets)
  const lowestIdx = Math.min(...soundedIdx)
  const bassOk = bassPc == null || (tuning[lowestIdx] + frets[lowestIdx]) % 12 === bassPc
  const highFret = Math.max(0, ...frets.filter((f) => f != null))
  let score = distinctCovered * 10 - span * 2 - mutedCount * 0.5 - highFret * 0.3
  if (bassOk) score += 8
  if (sounded.includes(rootPc)) score += 3
  return score
}

function baseFretFor(frets) {
  const fretted = frets.filter((f) => f != null && f > 0)
  if (!fretted.length) return 1
  const min = Math.min(...fretted)
  return min <= 1 ? 1 : min
}

/**
 * Até `limit` formações distintas do acorde pra afinação `tuning`, ordenadas
 * da mais "tocável" pra menos. Cada formação: `{ frets, baseFret }` —
 * `frets[i]` é o traste pressionado na corda `i` (0 = solta), ou `null` se a
 * corda não toca. Exige a fundamental (`rootPc`) soante em algum lugar;
 * relaxa a exigência de cobertura de notas distintas em etapas até achar
 * pelo menos uma formação (acordes estendidos podem precisar omitir notas
 * num instrumento com poucas cordas, ex.: ukulelê).
 */
export function buildFretVoicings(tuning, pcs, rootPc, bassPc, limit = 6) {
  const minStrings = Math.min(3, tuning.length)
  const perString = tuning.map((openPc) => fretChoicesForString(openPc, pcs))

  let results = []
  for (const target of [pcs.size, Math.max(2, pcs.size - 1), 2]) {
    results = []
    const seen = new Set()
    for (const combo of product(perString)) {
      if (fretSpan(combo) > MAX_SPAN) continue
      const sounded = combo.map((f, i) => (f == null ? null : (tuning[i] + f) % 12)).filter((v) => v != null)
      if (sounded.length < minStrings) continue
      const distinct = new Set(sounded)
      if (distinct.size < Math.min(target, pcs.size)) continue
      if (!distinct.has(rootPc)) continue
      const key = combo.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      results.push({ frets: combo, score: scoreVoicing(combo, tuning, rootPc, bassPc) })
    }
    if (results.length) break
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit).map(({ frets }) => ({ frets, baseFret: baseFretFor(frets) }))
}

/** Número de dedo (1-4) por corda pressionada, do traste mais grave pro mais
 * agudo — o mesmo traste em cordas diferentes recebe o mesmo dedo (aproxima
 * uma pestana). Corda solta (0) e abafada (null) não recebem dedo. */
export function assignFingers(frets) {
  const fretted = frets
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f != null && f > 0)
    .sort((a, b) => a.f - b.f || a.i - b.i)
  const fingerByString = {}
  let finger = 0
  let lastFret = null
  for (const { f, i } of fretted) {
    if (f !== lastFret) { finger += 1; lastFret = f }
    fingerByString[i] = Math.min(finger, 4)
  }
  return fingerByString
}

/**
 * Inversões pro teclado: todas as classes de altura do acorde empilhadas a
 * partir de cada nota (rotação), sempre ascendente — inversão 0 é o acorde
 * na posição fundamental. `notes` são semitons a partir da fundamental
 * (`rootPc`), prontos pra indexar a janela do teclado (ver PianoDiagram.jsx).
 */
export function buildPianoVoicings(pcs, rootPc) {
  const ordered = [...pcs].sort((a, b) => ((a - rootPc + 12) % 12) - ((b - rootPc + 12) % 12))
  const voicings = []
  for (let inv = 0; inv < ordered.length; inv++) {
    const rotated = [...ordered.slice(inv), ...ordered.slice(0, inv)]
    let prev = -1
    const notes = rotated.map((pc) => {
      let n = pc
      while (n <= prev) n += 12
      prev = n
      return n
    })
    voicings.push({ notes })
  }
  return voicings
}
