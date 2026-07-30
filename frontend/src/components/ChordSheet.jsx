import { useRef, useState } from 'react'
import { KNOWN_TYPES, parseBody } from '../utils/lineClassifier'
import { parseChordSymbol } from '../utils/chordParser'
import ChordHoverCard from './ChordHoverCard'

const SPLIT_RE = /(\s+)/
const HIDE_DELAY = 150
const CARD_WIDTH = 360
const CARD_HEIGHT_ESTIMATE = 220
const VIEWPORT_MARGIN = 10

function cardPosition(rect) {
  let left = rect.left
  if (left + CARD_WIDTH > window.innerWidth - VIEWPORT_MARGIN) left = window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN
  left = Math.max(VIEWPORT_MARGIN, left)
  let top = rect.bottom + 8
  if (top + CARD_HEIGHT_ESTIMATE > window.innerHeight - VIEWPORT_MARGIN) {
    top = Math.max(VIEWPORT_MARGIN, rect.top - CARD_HEIGHT_ESTIMATE - 8)
  }
  return { position: 'fixed', left, top, width: CARD_WIDTH, zIndex: 200 }
}

/**
 * Renderiza o corpo da cifra já tipado (letra/acorde/observação/solo/riff/
 * tab/seção/customizado — ver docs/MARCACAO_CIFRAS.md). Linhas marcadas como
 * ``:oculta`` continuam visíveis aqui (para o autor gerenciar), mas nunca vão
 * para o player karaokê — ver KaraokePlayer.jsx.
 *
 * Em linhas do tipo "acorde", cada símbolo reconhecido (ver
 * utils/chordParser.js) vira um span hoverável: parar o mouse em cima abre
 * um mini modal (ChordHoverCard) com o mesmo acorde em violão/teclado/
 * ukulelê lado a lado. Um pequeno atraso pra esconder (HIDE_DELAY) deixa o
 * mouse atravessar o espaço entre o símbolo e o modal sem ele fechar à toa
 * — necessário pra poder clicar em "variar acorde" dentro do modal.
 */
export default function ChordSheet({ body, className = '' }) {
  const entries = parseBody(body)
  const [hover, setHover] = useState(null) // { symbol, rect }
  const hideTimer = useRef(null)

  const cancelHide = () => clearTimeout(hideTimer.current)
  const scheduleHide = () => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setHover(null), HIDE_DELAY)
  }
  const showHover = (symbol, el) => {
    cancelHide()
    setHover({ symbol, rect: el.getBoundingClientRect() })
  }

  return (
    <div className={`chord-sheet ${className}`}>
      {entries.map(({ text, tipo, visivel }, i) => {
        const tipoClass = KNOWN_TYPES.includes(tipo) ? tipo : 'custom'
        const classes = [tipo !== 'letra' ? tipoClass : '', visivel ? '' : 'oculta']
          .filter(Boolean).join(' ')
        return (
          <div key={i} className={classes} data-tipo={tipoClass === 'custom' ? tipo : undefined}>
            {tipo === 'acorde' && text
              ? text.split(SPLIT_RE).map((part, j) => {
                  if (part.trim() === '') return part
                  if (!parseChordSymbol(part)) return part
                  return (
                    <span key={j} className="chord-token"
                      onMouseEnter={(e) => showHover(part, e.currentTarget)}
                      onMouseLeave={scheduleHide}>
                      {part}
                    </span>
                  )
                })
              : (text || ' ')}
          </div>
        )
      })}

      {hover && (
        <ChordHoverCard key={hover.symbol} symbol={hover.symbol} style={cardPosition(hover.rect)}
          onMouseEnter={cancelHide} onMouseLeave={scheduleHide} />
      )}
    </div>
  )
}
