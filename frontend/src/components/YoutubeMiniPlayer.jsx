import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useYoutubeMiniPlayerStore, MIN_WIDTH, MAX_WIDTH, MIN_HEIGHT, MAX_HEIGHT } from '../store/youtubeMiniPlayerStore'

/** Alça de redimensionar no canto inferior esquerdo do miniplayer (o único
 * canto livre — os outros três colam nas bordas do vídeo, no header, ou na
 * sidebar de acordes). Mesmo padrão de arrastar de ChordResizeHandle
 * (KaraokeChordSidebar.jsx): mousedown guarda o ponto+tamanho de partida,
 * mousemove no WINDOW (não no próprio elemento) calcula o delta — assim o
 * arrasto não se perde se o cursor sair da alça no meio do gesto. */
function ResizeHandle() {
  const setSize = useYoutubeMiniPlayerStore((s) => s.setSize)
  const dragRef = useRef(null) // { startX, startY, startWidth, startHeight } enquanto arrasta, senão null

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return
      const { startX, startY, startWidth, startHeight } = dragRef.current
      // canto INFERIOR esquerdo: arrastar pra esquerda cresce a largura
      // (borda esquerda se afasta), arrastar pra baixo cresce a altura.
      setSize(startWidth + (startX - e.clientX), startHeight + (e.clientY - startY))
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
  }, [setSize])

  const onMouseDown = (e) => {
    e.stopPropagation()
    const { width, height } = useYoutubeMiniPlayerStore.getState()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startWidth: width, startHeight: height }
    document.body.style.cursor = 'sw-resize'
    document.body.style.userSelect = 'none'
  }

  return <div className="k-youtube-mini-resize-handle" onMouseDown={onMouseDown} />
}

/** Miniplayer do YouTube pro palco de karaokê (item 4/5 do pedido) — canto
 * superior direito, entre a cifra e a sidebar de acordes (ver .k-youtube-mini
 * em global.css, ancorado com o mesmo `right: var(--k-sidebar-w)` que
 * .k-header/.k-controls já usam). Tamanho ajustável arrastando o canto
 * inferior esquerdo (ver ResizeHandle acima), persistido em
 * useYoutubeMiniPlayerStore.
 *
 * `enablejsapi=1` habilita o protocolo postMessage do embed do YouTube —
 * não é a lib oficial `iframe_api` (que exigiria carregar um script
 * externo), é o mesmo mecanismo leve que o embed já aceita nativamente,
 * então dá pra mandar comandos (`playVideo`/`pauseVideo`) sem esperar
 * nenhum "player ready" — o iframe enfileira a mensagem. Exposto via ref
 * (`play()`/`pause()`) pro botão "Tocar + YT" e o play/pause do karaokê
 * acionarem o vídeo junto com o áudio. */
const YoutubeMiniPlayer = forwardRef(function YoutubeMiniPlayer({ videoId, title }, ref) {
  const iframeRef = useRef(null)
  const width = useYoutubeMiniPlayerStore((s) => s.width)
  const height = useYoutubeMiniPlayerStore((s) => s.height)

  const sendCommand = (func) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }), '*',
    )
  }

  useImperativeHandle(ref, () => ({
    play: () => sendCommand('playVideo'),
    pause: () => sendCommand('pauseVideo'),
  }), [])

  return (
    <div className="k-youtube-mini no-print" style={{ width, height }}>
      <iframe ref={iframeRef}
        src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`}
        title={title || 'YouTube'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen frameBorder="0" />
      <ResizeHandle />
    </div>
  )
})

export default YoutubeMiniPlayer
