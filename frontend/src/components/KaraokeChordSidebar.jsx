import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInstrumentVoicings } from '../hooks/useChordVoicings'
import { useChordSidebarStore, MIN_FONT_SCALE, MAX_FONT_SCALE } from '../store/chordSidebarStore'
import ChordFretDiagram from './ChordFretDiagram'
import PianoDiagram from './PianoDiagram'

const STRINGS = { violao: 6, ukulele: 4 }
const MAX_COLUMNS = 3
// tamanho do diagrama em fontScale=1 — as DUAS dimensões escalam junto com
// fontScale (ver --k-chord-entry-h/--k-chord-diagram-w abaixo). Um SVG
// preserva proporção (preserveAspectRatio padrão): se só a altura mudasse
// (como era antes), a largura parada virava o gargalo e o diagrama nunca
// crescia de verdade — por isso as duas precisam acompanhar o fontScale.
const BASE_ENTRY_HEIGHT = 90
const BASE_DIAGRAM_WIDTH = 80 // por instrumento — dois lado a lado pedem 2×

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

/** Rodapé da sidebar: resumo da música em execução (título, artista, tom,
 * velocidade) + tamanho da fonte atual e os botões A−/A+ que a ajustam —
 * separados do zoom geral da cifra (useZoomStore/.k-controls), afetam só os
 * diagramas do assistente. */
function ChordSidebarFooter({ songInfo }) {
  const { t } = useTranslation('chordDictionary')
  const fontScale = useChordSidebarStore((s) => s.fontScale)
  const increaseFontScale = useChordSidebarStore((s) => s.increaseFontScale)
  const decreaseFontScale = useChordSidebarStore((s) => s.decreaseFontScale)

  return (
    <div className="k-chord-sidebar-footer">
      <div className="k-chord-sidebar-footer-title">{songInfo?.titulo}</div>
      <div className="k-chord-sidebar-footer-meta">
        {songInfo?.interprete}
        {songInfo?.tom && <> · {t('chordSidebar.tom', { tom: songInfo.tom })}</>}
        {songInfo?.velocidade != null && <> · {t('chordSidebar.speed', { value: songInfo.velocidade })}</>}
      </div>
      <div className="k-chord-sidebar-font-row">
        <span>{t('chordSidebar.fontSize', { percent: Math.round(fontScale * 100) })}</span>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn ghost" disabled={fontScale <= MIN_FONT_SCALE}
            onClick={decreaseFontScale} title={t('chordSidebar.fontSmaller')}>A−</button>
          <button type="button" className="btn ghost" disabled={fontScale >= MAX_FONT_SCALE}
            onClick={increaseFontScale} title={t('chordSidebar.fontBigger')}>A+</button>
        </div>
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
 * vazio". `songInfo` ({titulo, interprete, tom, velocidade}) alimenta o
 * rodapé (ver ChordSidebarFooter).
 *
 * O tamanho de cada diagrama é FIXO nas duas dimensões (altura E largura,
 * fontScale × BASE_ENTRY_HEIGHT/BASE_DIAGRAM_WIDTH — ver .k-chord-entry/
 * .k-chord-mini-diagram em global.css, flex-basis, não flex-grow): os
 * botões A−/A+ do rodapé (ChordSidebarFooter) controlam esse valor direto,
 * então o tamanho é sempre escolha do usuário, nunca "o que sobrar de
 * espaço" — as duas dimensões precisam mudar junto porque o SVG preserva
 * proporção (só a altura mudar deixava a largura como gargalo escondido).
 * O número de colunas se ajusta sozinho (até MAX_COLUMNS) pra tentar caber
 * tudo nesse tamanho sem rolar, reaproveitando a largura que o usuário abriu
 * arrastando a barra de redimensionamento (ChordResizeHandle). Quando não
 * cabe mesmo assim (fonte grande + muitos acordes + já em 3 colunas), a
 * coluna passa a rolar sozinha (overflow-y, ver .k-chord-sidebar-column) —
 * escolha deliberada: legibilidade em primeiro lugar, rolagem como válvula
 * de escape, não o contrário.
 */
export default function KaraokeChordSidebar({ chords, instruments, songInfo }) {
  const { t } = useTranslation('chordDictionary')
  const width = useChordSidebarStore((s) => s.width)
  const fontScale = useChordSidebarStore((s) => s.fontScale)
  const gridRef = useRef(null)
  const [columns, setColumns] = useState(1)
  const hasContent = Boolean(instruments?.length && chords?.length)

  useEffect(() => {
    const el = gridRef.current
    if (!el || !hasContent) return undefined
    const compute = () => {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const entryHeight = BASE_ENTRY_HEIGHT * fontScale
      const perColumnCapacity = Math.max(1, Math.floor(rect.height / entryHeight))
      const neededByHeight = Math.ceil(chords.length / perColumnCapacity)
      const columnWidth = instruments.length * BASE_DIAGRAM_WIDTH * fontScale
      const maxByWidth = Math.max(1, Math.floor(rect.width / columnWidth))
      setColumns(Math.max(1, Math.min(neededByHeight, maxByWidth, MAX_COLUMNS)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [chords, instruments, hasContent, fontScale])

  if (!hasContent) return null

  const columnChunks = chunkIntoColumns(chords, columns)

  return (
    <>
      <ChordResizeHandle />
      <aside className="k-chord-sidebar" style={{
        width,
        '--k-chord-entry-h': `${BASE_ENTRY_HEIGHT * fontScale}px`,
        '--k-chord-diagram-w': `${BASE_DIAGRAM_WIDTH * fontScale}px`,
        '--k-chord-font-scale': fontScale,
      }}>
        <div className="k-chord-sidebar-title">{t('chordSidebar.title')}</div>
        <div className="k-chord-sidebar-grid" ref={gridRef}>
          {columnChunks.map((chunk, i) => (
            <div className="k-chord-sidebar-column" key={i}>
              {chunk.map((symbol) => <ChordSidebarEntry key={symbol} symbol={symbol} instruments={instruments} />)}
            </div>
          ))}
        </div>
        <ChordSidebarFooter songInfo={songInfo} />
      </aside>
    </>
  )
}
