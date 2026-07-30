// Espelha backend/utils/parser.py (classify_line + parse_body). Necessário no
// cliente porque o editor (ChordSheet dentro do SongEditor) classifica o
// corpo local a cada digitação, sem round-trip à API.
//
// Marcação suportada (ver docs/MARCACAO_CIFRAS.md):
//   - "[Texto]" sozinho na linha     -> rótulo de seção (tipo "secao")
//   - "[@tipo]" / "[@tipo:oculta]"   -> marcação explícita; sozinha na linha
//     abre um bloco até "[@/tipo]", seguida de texto classifica só a linha
//   - sem marcação                   -> heurística (acorde/letra)

const CHORD_LINE_RE = /^[\sA-G#b/mM0-9()ºªao+°susadimaj.,|:-]*$/
const HAS_NOTE_RE = /[A-G]/
const NOTE_KEYWORD_RE = /^\(?\s*(intro|introdu[çc][ãa]o|solo|ponte|refr[ãa]o|estrofe|primeira parte|segunda parte|repete|repetir|repeti[çc][ãa]o|final|coda|obs\.?|observa[çc][ãa]o|interl[úu]dio|riff|base|break|improviso)\b/i
const BRACKETED_RE = /^\s*[([].+[)\]]\s*$/

const SECTION_LABEL_RE = /^\[([^[\]@][^[\]]*)\]\s*$/
const TAG_OPEN_RE = /^\[@([a-zA-ZÀ-ÿ_-]+)(?::([a-zA-ZÀ-ÿ_-]+))?\]\s*(.*)$/
const TAG_CLOSE_RE = /^\[@\/([a-zA-ZÀ-ÿ_-]+)\]\s*$/
const TIMING_RE = /^\[t=(\d+(?:\.\d+)?)\]\s*(.*)$/

/** Espelha parse_line_timing do backend: extrai o marcador [t=SEG] do início da linha. */
function parseLineTiming(raw) {
  const m = raw.match(TIMING_RE)
  return m ? { t: parseFloat(m[1]), line: m[2] } : { t: null, line: raw }
}

export const KNOWN_TYPES = ['letra', 'acorde', 'observacao', 'solo', 'riff', 'tab', 'secao', 'sample']

/** Classifica uma linha isolada (sem contexto de bloco): 'acorde' | 'observacao' | 'letra'. */
export function classifyLine(text) {
  const stripped = (text || '').trim()
  if (!stripped) return 'letra'
  if (BRACKETED_RE.test(stripped) || NOTE_KEYWORD_RE.test(stripped)) return 'observacao'
  if (HAS_NOTE_RE.test(stripped) && CHORD_LINE_RE.test(stripped)) return 'acorde'
  return 'letra'
}

/**
 * Converte o corpo da cifra em uma lista de linhas tipadas:
 * { text, t, tipo, visivel, raw }[]. `raw` é o índice da linha física
 * original (body.split('\n')) — usado pelo editor (SyncWorkspace.jsx) pra
 * saber em qual linha crua escrever um [t=SEG] marcado a partir de um
 * passo (ver utils/steps.js::stepRawIndex). Linhas de marcação (rótulo,
 * abre/fecha bloco) não são emitidas — só o efeito delas sobre as linhas
 * de conteúdo — logo não têm `raw`, o que evita por construção que algo
 * tente marcar uma linha que o parser descarta.
 */
export function parseBody(body) {
  const entries = []
  let openBlock = null // { tipo, visivel }
  const rawLines = (body || '').split('\n')

  for (let idx = 0; idx < rawLines.length; idx++) {
    const { t, line } = parseLineTiming(rawLines[idx])
    const stripped = line.trim()

    if (openBlock) {
      const closeM = stripped.match(TAG_CLOSE_RE)
      if (closeM && closeM[1].toLowerCase() === openBlock.tipo) {
        openBlock = null
        continue
      }
      entries.push({ text: line, t, tipo: openBlock.tipo, visivel: openBlock.visivel, raw: idx })
      continue
    }

    const openM = stripped.match(TAG_OPEN_RE)
    if (openM) {
      const tipo = openM[1].toLowerCase()
      const visivel = (openM[2] || '').toLowerCase() !== 'oculta'
      const resto = openM[3]
      if (resto) {
        entries.push({ text: resto, t, tipo, visivel, raw: idx })
      } else {
        openBlock = { tipo, visivel }
      }
      continue
    }

    const labelM = stripped.match(SECTION_LABEL_RE)
    if (labelM) {
      entries.push({ text: labelM[1].trim(), t, tipo: 'secao', visivel: true, raw: idx })
      continue
    }

    entries.push({ text: line, t, tipo: classifyLine(line), visivel: true, raw: idx })
  }

  return entries
}
