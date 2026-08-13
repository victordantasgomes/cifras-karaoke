// Reconhecimento de acordes para o acompanhamento sintetizado (ver
// utils/bandSynth.js). Duas funções puras: tokenizar uma linha de acorde
// crua em símbolos + coluna (posição horizontal = quando o acorde muda,
// convenção padrão de cifra), e traduzir um símbolo ("Am7", "C#dim",
// "G/B"...) em classe de altura (0-11) + intervalos + baixo opcional.

/** Extrai tokens não-espaço de uma linha de acorde, com sua coluna. */
export function tokenizeChordLine(text) {
  const tokens = []
  const re = /\S+/g
  let m
  while ((m = re.exec(text || ''))) tokens.push({ raw: m[0], col: m.index })
  return tokens
}

const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

// da mais específica pra mais genérica (o regex tenta cada uma nessa ordem,
// com backtracking — a ordem não afeta a corretude, só o custo de tentativas)
const QUALITIES = [
  ['maj7', [0, 4, 7, 11]],
  ['maj9', [0, 4, 7, 11, 14]],
  ['m7b5', [0, 3, 6, 10]],
  ['dim7', [0, 3, 6, 9]],
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['add9', [0, 4, 7, 14]],
  ['m6', [0, 3, 7, 9]],
  ['m9', [0, 3, 7, 10, 14]],
  ['m7', [0, 3, 7, 10]],
  ['maj', [0, 4, 7]],
  ['dim', [0, 3, 6]],
  ['aug', [0, 4, 8]],
  ['sus', [0, 5, 7]], // sem número: convenção mais comum é sus4
  ['m', [0, 3, 7]],
  ['7', [0, 4, 7, 10]],
  ['9', [0, 4, 7, 10, 14]],
  ['6', [0, 4, 7, 9]],
  ['+', [0, 4, 8]],
]
const QUALITY_RE = QUALITIES.map(([suf]) => suf.replace('+', '\\+')).join('|')
const CHORD_RE = new RegExp(`^([A-G])([#b]?)(${QUALITY_RE})?(?:/([A-G])([#b]?))?$`, 'i')

function pitchClass(letter, acc) {
  let pc = NOTE_BASE[letter.toUpperCase()]
  if (acc === '#') pc = (pc + 1) % 12
  if (acc === 'b') pc = (pc + 11) % 12
  return pc
}

/**
 * Reconhece um símbolo de acorde isolado. Retorna
 * `{root, quality, intervals, bass}` ou `null` se irreconhecível (ex.:
 * "%", "N.C.", algo com parênteses) — o chamador simplesmente não gera um
 * novo ponto de troca de acorde nesse caso; o acorde anterior continua.
 */
export function parseChordSymbol(symbol) {
  const m = CHORD_RE.exec((symbol || '').trim())
  if (!m) return null
  const [, rootL, rootAcc, qualityRaw, bassL, bassAcc] = m
  const found = QUALITIES.find(([suf]) => suf.toLowerCase() === (qualityRaw || '').toLowerCase())
  return {
    root: pitchClass(rootL, rootAcc),
    quality: found ? found[0] : 'maj',
    intervals: found ? found[1] : [0, 4, 7],
    bass: bassL ? pitchClass(bassL, bassAcc) : null,
  }
}

/** Lista os símbolos de acorde únicos de uma música, na ordem em que
 * aparecem pela primeira vez — usado pelo assistente de acordes fixo do
 * player karaokê (ver KaraokeChordSidebar.jsx). `lines` é o mesmo array já
 * tipado/filtrado que o payload do karaokê expõe (backend/services/
 * karaoke_service.py::payload — linhas ocultas já vêm de fora); só conta
 * linhas tipo "acorde" e tokens reconhecidos por parseChordSymbol — o mesmo
 * acorde pode se repetir dezenas de vezes ao longo da música, mas entra só
 * uma vez na lista. */
export function extractUniqueChords(lines) {
  const seen = new Set()
  const result = []
  for (const line of lines || []) {
    if (line.tipo !== 'acorde' || !line.text) continue
    for (const { raw } of tokenizeChordLine(line.text)) {
      if (seen.has(raw) || !parseChordSymbol(raw)) continue
      seen.add(raw)
      result.push(raw)
    }
  }
  return result
}
