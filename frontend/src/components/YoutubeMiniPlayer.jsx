import { forwardRef, useImperativeHandle, useRef } from 'react'

/** Miniplayer do YouTube pro palco de karaokê (item 4/5 do pedido) — canto
 * superior direito, entre a cifra e a sidebar de acordes (ver .k-youtube-mini
 * em global.css, ancorado com o mesmo `right: var(--k-sidebar-w)` que
 * .k-header/.k-controls já usam). `enablejsapi=1` habilita o protocolo
 * postMessage do embed do YouTube — não é a lib oficial `iframe_api` (que
 * exigiria carregar um script externo), é o mesmo mecanismo leve que o
 * embed já aceita nativamente, então dá pra mandar comandos (`playVideo`)
 * sem esperar nenhum "player ready" — o iframe enfileira a mensagem. Exposto
 * via ref (`play()`) pro botão "Tocar + YT" acionar o vídeo junto com o
 * áudio/karaokê. */
const YoutubeMiniPlayer = forwardRef(function YoutubeMiniPlayer({ videoId, title }, ref) {
  const iframeRef = useRef(null)

  useImperativeHandle(ref, () => ({
    play: () => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*',
      )
    },
  }), [])

  return (
    <div className="k-youtube-mini no-print">
      <iframe ref={iframeRef}
        src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0`}
        title={title || 'YouTube'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen frameBorder="0" />
    </div>
  )
})

export default YoutubeMiniPlayer
