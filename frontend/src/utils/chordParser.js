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

// Maiúsculas/minúsculas IMPORTAM aqui — é o único jeito de distinguir "m"
// (menor) de "M" (maior, usado na notação brasileira "7M"/"9M" e em aliases
// como "M7"/"CM"). Por isso o regex abaixo NÃO usa a flag /i: só a LETRA da
// nota (raiz e baixo) aceita maiúscula/minúscula (classe [A-Ga-g]) — a
// qualidade é comparada sempre no mesmo caso em que está escrita.
//
// Da mais específica pra mais genérica não é estritamente necessário (o
// regex tenta cada uma nessa ordem, com backtracking, e as âncoras ^/$
// garantem que só uma alternativa que consuma a string INTEIRA vence — ver
// CHORD_RE), mas ajuda a leitura.
const QUALITIES = [
  ['maj7', [0, 4, 7, 11]],
  ['maj9', [0, 4, 7, 11, 14]],
  ['m7b5', [0, 3, 6, 10]],
  ['dim7', [0, 3, 6, 9]],
  ['m7M', [0, 3, 7, 11]], // menor com sétima maior ("Am7M")
  ['mM7', [0, 3, 7, 11]], // grafia alternativa ("AmM7")
  ['9M', [0, 4, 7, 11, 14]], // notação brasileira: nona maior ("C9M")
  ['7M', [0, 4, 7, 11]], // notação brasileira: sétima maior ("C7M")
  ['M9', [0, 4, 7, 11, 14]], // grafia alternativa ("CM9")
  ['M7', [0, 4, 7, 11]], // grafia alternativa ("CM7")
  ['sus2', [0, 2, 7]],
  ['sus4', [0, 5, 7]],
  ['add9', [0, 4, 7, 14]],
  ['m6/9', [0, 3, 7, 9, 14]],
  ['6/9', [0, 4, 7, 9, 14]], // "seis-com-nona", também grafado sem barra: "69"
  ['69', [0, 4, 7, 9, 14]],
  ['m6', [0, 3, 7, 9]],
  ['m9', [0, 3, 7, 10, 14]],
  ['m11', [0, 3, 7, 10, 14, 17]],
  ['m13', [0, 3, 7, 10, 14, 21]],
  ['m7', [0, 3, 7, 10]],
  ['maj', [0, 4, 7]],
  ['dim', [0, 3, 6]],
  ['aug', [0, 4, 8]],
  ['sus', [0, 5, 7]], // sem número: convenção mais comum é sus4
  ['m', [0, 3, 7]],
  ['M', [0, 4, 7]], // "CM" — maior explícito, equivalente a "C"
  ['11', [0, 4, 7, 10, 14, 17]],
  ['13', [0, 4, 7, 10, 14, 21]],
  ['7', [0, 4, 7, 10]],
  ['9', [0, 4, 7, 10, 14]],
  ['6', [0, 4, 7, 9]],
  ['5', [0, 7]], // poder-de-quinta ("power chord"): sem terça
  ['+', [0, 4, 8]],
]
const QUALITY_RE = QUALITIES.map(([suf]) => suf.replace('+', '\\+')).join('|')
const CHORD_RE = new RegExp(`^([A-Ga-g])([#b]?)(${QUALITY_RE})?(?:/([A-Ga-g])([#b]?))?$`)

// Extensão/alteração entre parênteses no final do símbolo — anotação comum
// em cifra brasileira pra acrescentar ou alterar uma nota sem trocar a
// qualidade base: "G7(9)", "Dm7(9,13)", "A7(b5)", "C(9)". Pode vir seguida
// de um baixo/inversão: "C7(9)/E". Cada item dentro dos parênteses é um
// grau (5, 6, 7, 9, 11, 13) com acidente opcional (#/b).
const PAREN_RE = /^(.*?)\(([^()]+)\)((?:\/[A-Ga-g][#b]?)?)$/
const EXTENSION_RE = /^([#b]?)(5|6|7|9|11|13)$/
const DEGREE_SEMITONES = { 5: 7, 6: 9, 7: 11, 9: 14, 11: 17, 13: 21 }

function pitchClass(letter, acc) {
  let pc = NOTE_BASE[letter.toUpperCase()]
  if (acc === '#') pc = (pc + 1) % 12
  if (acc === 'b') pc = (pc + 11) % 12
  return pc
}

/** Aplica um único grau entre parênteses (ex.: "9", "b5", "#11") aos
 * intervalos já resolvidos pela qualidade base. O grau 5 SUBSTITUI a quinta
 * existente (é uma alteração: "b5"/"#5"); os demais são ACRESCENTADOS
 * (é uma extensão), sem duplicar se a nota já estiver presente. Item
 * irreconhecível (texto solto, ex. um comentário) é ignorado. */
function applyExtension(intervals, ext) {
  const m = EXTENSION_RE.exec(ext.trim())
  if (!m) return intervals
  const [, acc, degreeStr] = m
  let semitone = DEGREE_SEMITONES[Number(degreeStr)]
  if (acc === '#') semitone += 1
  if (acc === 'b') semitone -= 1
  if (degreeStr === '5') {
    return [...intervals.filter((i) => (((i % 12) + 12) % 12) !== 7), semitone]
  }
  if (intervals.includes(semitone)) return intervals
  return [...intervals, semitone]
}

/**
 * Reconhece um símbolo de acorde isolado. Retorna
 * `{root, quality, intervals, bass}` ou `null` se irreconhecível (ex.:
 * "%", "N.C.") — o chamador simplesmente não gera um novo ponto de troca de
 * acorde nesse caso; o acorde anterior continua.
 */
export function parseChordSymbol(symbol) {
  const trimmed = (symbol || '').trim()
  const pm = PAREN_RE.exec(trimmed)
  const base = pm ? pm[1] + pm[3] : trimmed
  const extensions = pm ? pm[2].split(/[,\s]+/).filter(Boolean) : []

  const m = CHORD_RE.exec(base)
  if (!m) return null
  const [, rootL, rootAcc, qualityRaw, bassL, bassAcc] = m
  const found = QUALITIES.find(([suf]) => suf === (qualityRaw || ''))
  let intervals = found ? found[1] : [0, 4, 7]
  for (const ext of extensions) intervals = applyExtension(intervals, ext)

  return {
    root: pitchClass(rootL, rootAcc),
    quality: found ? found[0] : 'maj',
    intervals,
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
