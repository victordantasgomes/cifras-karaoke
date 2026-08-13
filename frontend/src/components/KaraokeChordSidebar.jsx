import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInstrumentVoicings } from '../hooks/useChordVoicings'
import { useChordSidebarStore } from '../store/chordSidebarStore'
import ChordFretDiagram from './ChordFretDiagram'
import PianoDiagram from './PianoDiagram'

const STRINGS = { violao: 6, ukulele: 4 }
const MAX_COLUMNS = 3
const MIN_ENTRY_HEIGHT = 70 // px — abaixo disso o diagrama fica ilegível, melhor abrir mais uma coluna
const MIN_COLUMN_WIDTH_PER_INSTRUMENT = 56 // px — largura mínima confortável por mini-diagrama lado a lado

/** Divide `items` em até `columns` grupos contíguos (lê como um jornal:
 * coluna 1 inteira de cima a baixo, depois coluna 2...) — preserva a ordem
 * de aparição dentro de cada coluna. */
function chunkIntoColumns(items, columns) {
  if (columns <= 1) return [items]
  const perColumn = Math.ceil(items.length / columns)
  const chunks = []
  for (let i = 0; i < items.length; i += perColumn) chunks.push(items.slice(i, i + perColumn))
  return chunks
}

/** Barra de redimensionamento entre a cifra e o assistente de acordes —
 * arrastar pra esquerda aumenta a sidebar, pra direita diminui (ela fica na
 * lateral direita da tela). Largura persistida em useChordSidebarStore. */
function ChordResizeHandle() {
  const setWidth = useChordSidebarStore((s) => s.setWidth)
  const dragRef = useRef(null) // { startX, startWidth } enquanto arrasta, senão null

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return
      const { startX, startWidth } = dragRef.current
      setWidth(startWidth + (startX - e.clientX))
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setWidth])

  const onMouseDown = (e) => {
    dragRef.current = { startX: e.clientX, startWidth: useChordSidebarStore.getState().width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  return <div className="k-chord-resize-handle" onMouseDown={onMouseDown} />
}

/** Uma linha do assistente: nome do acorde + um mini-diagrama por
 * instrumento selecionado. Sempre chama os 3 hooks de formação (mesma
 * fonte de ChordHoverCard.jsx) na mesma ordem, independente de quantos
 * instrumentos estão selecionados — só o RENDER filtra pelos escolhidos,
 * pra não violar a regra de hooks com uma lista de tamanho variável. */
function ChordSidebarEntry({ symbol, instruments }) {
  const violao = useInstrumentVoicings('violao', symbol)
  const ukulele = useInstrumentVoicings('ukulele', symbol)
  const teclado = useInstrumentVoicings('teclado', symbol)
  const byInstrument = { violao, ukulele, teclado }

  return (
    <div className="k-chord-entry">
      <div className="k-chord-entry-name">{symbol}</div>
      <div className="k-chord-entry-diagrams">
        {instruments.map((inst) => {
          const { loading, voicings } = byInstrument[inst]
          const voicing = voicings[0]
          return (
            <div key={inst} className="k-chord-mini-diagram">
              {loading ? null : voicing ? (
                inst === 'teclado'
                  ? <PianoDiagram rootPc={voicing.rootPc} notes={voicing.notes} />
                  : <ChordFretDiagram frets={voicing.frets} fingers={voicing.fingers}
                      baseFret={voicing.baseFret} tuning={voicing.tuning} strings={STRINGS[inst]} />
              ) : <div className="k-chord-mini-empty">—</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Assistente de acordes do player karaokê (ScrollPlayer.jsx/KaraokeStage.jsx):
 * painel fixo na lateral direita com todos os acordes únicos da música em
 * execução, na ordem em que aparecem pela primeira vez, cada um com o(s)
 * diagrama(s) do(s) instrumento(s) que o usuário escolheu ver (preferência
 * pessoal — ver botão "Assistente de acordes" na tela Setlists e
 * settings.prefs.chordInstruments). Sem instrumento selecionado, ou sem
 * acorde nenhum reconhecido na música, não renderiza nada — nunca "aparece
 * vazio".
 *
 * Nunca rola: dentro de cada coluna, os acordes dividem igualmente a altura
 * disponível (flex) — quando isso deixaria os diagramas pequenos demais
 * (abaixo de MIN_ENTRY_HEIGHT), o número de colunas aumenta sozinho (até
 * MAX_COLUMNS), reaproveitando a largura que o usuário abriu arrastando a
 * barra de redimensionamento (ChordResizeHandle) em vez de continuar
 * espremendo verticalmente — ver useEffect com ResizeObserver abaixo.
 */
export default function KaraokeChordSidebar({ chords, instruments }) {
  const { t } = useTranslation('chordDictionary')
  const width = useChordSidebarStore((s) => s.width)
  const gridRef = useRef(null)
  const [columns, setColumns] = useState(1)
  const hasContent = Boolean(instruments?.length && chords?.length)

  useEffect(() => {
    const el = gridRef.current
    if (!el || !hasContent) return undefined
    const compute = () => {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const perColumnCapacity = Math.max(1, Math.floor(rect.height / MIN_ENTRY_HEIGHT))
      const neededByHeight = Math.ceil(chords.length / perColumnCapacity)
      const minColumnWidth = Math.max(90, instruments.length * MIN_COLUMN_WIDTH_PER_INSTRUMENT)
      const maxByWidth = Math.max(1, Math.floor(rect.width / minColumnWidth))
      setColumns(Math.max(1, Math.min(neededByHeight, maxByWidth, MAX_COLUMNS)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [chords, instruments, hasContent])

  if (!hasContent) return null

  const columnChunks = chunkIntoColumns(chords, columns)

  return (
    <>
      <ChordResizeHandle />
      <aside className="k-chord-sidebar" style={{ width }}>
        <div className="k-chord-sidebar-title">{t('chordSidebar.title')}</div>
        <div className="k-chord-sidebar-grid" ref={gridRef}>
          {columnChunks.map((chunk, i) => (
            <div className="k-chord-sidebar-column" key={i}>
              {chunk.map((symbol) => <ChordSidebarEntry key={symbol} symbol={symbol} instruments={instruments} />)}
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
