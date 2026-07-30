// Constrói a linha do tempo de acordes usada pelo acompanhamento
// sintetizado (ver utils/bandSynth.js) a partir dos PASSOS JÁ RESOLVIDOS
// (ver utils/timeline.js::resolveTimeline) — cada passo já tem `.t`/`.tEnd`
// reais em segundos.

import { tokenizeChordLine, parseChordSymbol } from './chordParser'

// só passos 'pair' (acorde+letra) e 'single' com tipo 'acorde' (linha de
// acorde solta, sem letra pareada) carregam texto de acorde
function chordTextOf(step) {
  if (step.kind === 'pair') return step.chord.text
  if (step.kind === 'single' && step.line.tipo === 'acorde') return step.line.text
  return null
}

/**
 * Pontos de troca de acorde (ainda sem duração) — um por símbolo
 * reconhecido em cada linha de acorde, posicionado proporcionalmente à
 * coluna dentro do intervalo [t, tEnd] do passo que o contém (o
 * denominador é o comprimento da PRÓPRIA linha de acorde, sem espaços à
 * direita — não o da letra pareada, que pode ter tamanho diferente).
 *
 * @param {Array} resolvedSteps
 * @returns {{t:number, root:number, quality:string, intervals:number[], bass:number|null}[]}
 */
export function buildChordChangePoints(resolvedSteps) {
  const points = []
  for (const step of resolvedSteps) {
    const text = chordTextOf(step)
    if (text == null) continue
    const tokens = tokenizeChordLine(text)
    if (tokens.length === 0) continue
    const refLength = Math.max(text.replace(/\s+$/, '').length, 1)
    const span = Math.max(0, step.tEnd - step.t)
    for (const tok of tokens) {
      const parsed = parseChordSymbol(tok.raw)
      if (!parsed) continue // símbolo não reconhecido: o acorde anterior continua
      const frac = Math.min(0.999, tok.col / refLength)
      points.push({ t: step.t + frac * span, ...parsed })
    }
  }
  points.sort((a, b) => a.t - b.t)
  return points
}

/**
 * Segmentos {root, quality, intervals, bass, start, end} cobrindo do
 * primeiro acorde reconhecido até `songDuration`. Passos sem texto de
 * acorde (letra pura, bloco de solo/riff/tab, seção, observação, sample)
 * não geram ponto novo — o acorde anterior automaticamente continua
 * soando até o próximo ponto, sem tratamento especial de "buraco".
 *
 * @param {Array} resolvedSteps
 * @param {number} songDuration
 */
export function buildChordTimeline(resolvedSteps, songDuration) {
  const points = buildChordChangePoints(resolvedSteps)
  return points.map((p, i) => ({
    ...p,
    start: p.t,
    end: i + 1 < points.length ? points[i + 1].t : songDuration,
  }))
}
