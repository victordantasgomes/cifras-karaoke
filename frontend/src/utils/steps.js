// Agrupa as linhas já tipadas (parseBody/parse_body) em "passos" de
// reprodução para o palco do karaokê e para o preview de sincronização do
// editor — nunca para a folha de cifra nem para a edição, que continuam
// linha a linha exatamente como estão no arquivo.

/**
 * @typedef {{text:string, tipo:string, t:number|null}} FlatLine
 * @typedef {
 *   {kind:'pair', chord:FlatLine, lyric:FlatLine, t:number|null, rows:2} |
 *   {kind:'block', lines:FlatLine[], t:number|null, rows:number} |
 *   {kind:'single', line:FlatLine, t:number|null, rows:1}
 * } Step
 */

// solo/riff/tab: marcação em bloco ([@tipo]...[@/tipo]) cujas linhas são
// tocadas simultaneamente, não em sequência — ver groupIntoSteps.
const BLOCK_TYPES = new Set(['solo', 'riff', 'tab'])

/**
 * Uma linha 'acorde' IMEDIATAMENTE seguida por uma linha 'letra' vira um
 * único passo — o acorde nunca mais avança ou é exibido separado da letra
 * que ele acompanha (fica posicionado logo acima, no mesmo instante).
 *
 * Uma sequência contígua de linhas do mesmo tipo em BLOCK_TYPES (solo/riff/
 * tab) também vira um único passo — as linhas de um riff/solo/tablatura são
 * tocadas ao mesmo tempo, não uma depois da outra.
 *
 * Qualquer outro caso (letra sem acorde antes, acorde sem letra logo
 * depois, observação/seção/sample) vira um passo isolado, inalterado.
 *
 * @param {FlatLine[]} lines
 * @returns {Step[]}
 */
export function groupIntoSteps(lines) {
  const steps = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const next = lines[i + 1]
    if (line.tipo === 'acorde' && next && next.tipo === 'letra') {
      // prefere o tempo explícito da letra; cai pro do acorde se só ele tiver
      steps.push({ kind: 'pair', chord: line, lyric: next, t: next.t ?? line.t, rows: 2 })
      i += 2
    } else if (BLOCK_TYPES.has(line.tipo)) {
      const blockLines = [line]
      let j = i + 1
      while (j < lines.length && lines[j].tipo === line.tipo) {
        blockLines.push(lines[j])
        j += 1
      }
      // primeiro tempo explícito entre as linhas do bloco (ou null, interpolado)
      const t = blockLines.find((l) => l.t != null)?.t ?? null
      steps.push({ kind: 'block', lines: blockLines, t, rows: blockLines.length })
      i = j
    } else {
      steps.push({ kind: 'single', line, t: line.t, rows: 1 })
      i += 1
    }
  }
  return steps
}

/**
 * Linha física (raw, ver utils/lineClassifier.js) que uma ação de "marcar
 * tempo" deve escrever para este passo. 'pair' usa a LETRA — mesma
 * preferência que groupIntoSteps já usa pra resolver step.t (lyric.t ??
 * chord.t). 'block' usa sempre a PRIMEIRA linha de conteúdo do bloco,
 * independente de qual linha do bloco carrega o `t` hoje (groupIntoSteps
 * resolve step.t como a primeira linha do bloco com t != null — marcar
 * sempre lines[0] mantém essa prioridade, não é um bug a "corrigir").
 * Nunca aponta pra uma tag de abertura ([@tipo] sozinho na linha), que não
 * gera entrada em parseBody e portanto não tem `raw`.
 *
 * @param {Step} step
 * @returns {number}
 */
export function stepRawIndex(step) {
  if (step.kind === 'pair') return step.lyric.raw
  if (step.kind === 'block') return step.lines[0].raw
  return step.line.raw
}

/**
 * Acumula passos a partir de startIndex até esgotar o orçamento de LINHAS
 * FÍSICAS (rowBudget) — nunca ultrapassa (um passo 'pair'/'block' que não
 * caiba inteiro simplesmente encerra a janela ali, sem estourar). Exceção:
 * o PRIMEIRO passo da janela sempre entra, mesmo que sozinho já exceda o
 * orçamento (ex.: uma tablatura mais longa que ROW_BUDGET) — senão a tela
 * ficaria em branco em vez de mostrar o bloco. Só completa com linhas em
 * branco quando os passos realmente acabaram (fim da música); não estica
 * um buraco no meio da música só pra sempre bater o orçamento.
 *
 * @param {Step[]} steps
 * @param {number} startIndex
 * @param {number} rowBudget
 * @returns {Step[]}
 */
export function buildStepWindow(steps, startIndex, rowBudget) {
  const window = []
  let rows = 0
  let i = startIndex
  while (i < steps.length) {
    const step = steps[i]
    if (window.length > 0 && rows + step.rows > rowBudget) break
    window.push(step)
    rows += step.rows
    i += 1
  }
  while (rows < rowBudget && i >= steps.length) {
    window.push({ kind: 'single', line: { text: '', tipo: 'letra' }, t: null, rows: 1 })
    rows += 1
  }
  return window
}
