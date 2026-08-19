import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { usePublicApiBase } from '../utils/publicApiBase'
import { usePlaylistStore } from '../store/playlistStore'
import { useZoomStore } from '../store/zoomStore'
import { useHotkeys } from '../hooks/useHotkeys'
import { usePedalControl } from '../hooks/usePedalControl'
import { extractUniqueChords } from '../utils/chordParser'
import { useChordSidebarStore } from '../store/chordSidebarStore'
import KaraokeChordSidebar from '../components/KaraokeChordSidebar'
import YoutubeMiniPlayer from '../components/YoutubeMiniPlayer'
import { extractYoutubeId } from '../utils/youtube'

const CHORD_LIKE = new Set(['acorde', 'solo', 'riff', 'tab'])
const MIN_RATE = 0.5
const MAX_RATE = 2
const MIN_DURATION_MS = 3000

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * PLAYER MODO ROLAGEM (padrão de @modoexecucao) — tela cheia, fundo preto.
 * Rola a página com a cifra inteira (letra, acordes, solos, riffs,
 * tablaturas, observações normais — mesma filtragem de `visivel` do modo
 * karaokê, ver backend/services/karaoke_service.py::payload) do início ao
 * fim, SEM trocar a cor de nenhum caractere: branco (cor padrão) para
 * letra/observações, âmbar para acordes/solos/riffs/tablaturas — ao
 * contrário do modo Karaokê (KaraokeStage.jsx), nenhuma linha "ativa" é
 * destacada aqui.
 *
 * Duas frentes de sincronismo pro avanço da rolagem:
 *  - `hasAudio` (há faixa de referência enviada, ver AudioService): a
 *    rolagem segue o `currentTime` real do elemento `<audio>` (evento
 *    `timeupdate`) — mesma faixa que toca no modo Karaokê, aqui tocando
 *    junto com a rolagem em vez de linha a linha. Play/pause, velocidade
 *    (`rate`) e busca (clique na barra de progresso, scroll manual) todos
 *    agem sobre o elemento `<audio>`, não sobre um cronômetro.
 *  - modo legado (sem áudio): cronômetro fixo baseado em `@tempoexecucao`
 *    (ou estimativa), como sempre funcionou — inalterado.
 * `getElapsedMs`/`seekToMs` abstraem qual das duas frentes está no comando,
 * então o resto do componente (scroll, progress bar, hotkeys) não precisa
 * saber a diferença.
 *
 * A rolagem usa `scrollTop` de verdade em `.scroll-viewport` (não um
 * `translateY` fake) — assim o músico ganha de graça o scroll do mouse e a
 * barra de rolagem nativa da tela pra avançar/voltar na música manualmente,
 * além das setas ↑/↓ (ver `nudgeScroll`/hotkeys abaixo). `applyOffset`
 * escreve `scrollTop` a cada atualização de posição (marcando
 * `programmaticScroll` pra `handleUserScroll` não confundir com scroll do
 * usuário); qualquer scroll que NÃO passou por `applyOffset` é do usuário —
 * `handleUserScroll` então busca (seek) pra posição nova, de forma que
 * retomar o play (ou a faixa de áudio) continua dali, sem saltar de volta.
 */
export default function ScrollPlayer({ data }) {
  const { t } = useTranslation('scrollPlayer')
  const { slug } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const base = usePublicApiBase()
  const playlist = usePlaylistStore()
  const { zoom, zoomIn, zoomOut } = useZoomStore()
  const hasAudio = Boolean(data.has_audio)
  const [playing, setPlaying] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [rate, setRate] = useState(1)
  const [elapsedDisplay, setElapsedDisplay] = useState(0)
  const [audioDuration, setAudioDuration] = useState(null)
  const [audioReady, setAudioReady] = useState(false)
  const stageRef = useRef(null)
  const viewportRef = useRef(null)
  const sheetRef = useRef(null)
  const progressFillRef = useRef(null)
  const hideTimer = useRef(null)
  const audioRef = useRef(null)
  const elapsedRef = useRef(0) // ms decorridos no modo legado (sem áudio)
  const intervalRef = useRef(null)
  const programmaticScroll = useRef(false) // true enquanto applyOffset() está escrevendo scrollTop
  const ytRef = useRef(null)

  const inPlaylist = playlist.active && playlist.queue[playlist.index]?.song?.slug === slug
  const canPlay = !hasAudio || audioReady

  // marca própria do dono da música (Fase 8) — rota pública (sem auth),
  // mesmo raciocínio de KaraokeStage.jsx.
  const { data: branding } = useQuery({
    queryKey: ['branding-info', data.owner_id],
    queryFn: () => api.get(`/branding/${data.owner_id}`).then((r) => r.data),
    enabled: Boolean(data.owner_id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  // assistente de acordes (preferência pessoal, configurada na tela
  // Setlists — ver Setlists.jsx::ChordAssistantPanel) — lista os instrumentos
  // escolhidos e os acordes únicos da música, na ordem em que aparecem.
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    enabled: Boolean(token),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const chordInstruments = settings?.prefs?.chordInstruments || []
  const uniqueChords = useMemo(() => extractUniqueChords(data.lines), [data.lines])
  const chordSidebarVisible = chordInstruments.length > 0 && uniqueChords.length > 0
  const chordSidebarWidth = useChordSidebarStore((s) => s.width)
  const youtubeVideoId = extractYoutubeId(data.youtube_url)

  // a rota /karaoke/:slug não desmonta este componente ao trocar de música
  // dentro de uma playlist com duas músicas seguidas em modo rolagem (mesmo
  // elemento de rota, mesmo tipo de componente) — precisa resetar
  // manualmente o que é específico da faixa anterior a cada troca de slug.
  useEffect(() => {
    elapsedRef.current = 0
    setElapsedDisplay(0)
    setPlaying(false)
    setRate(1)
    setAudioDuration(null)
    setAudioReady(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // faixa de referência: buscada como Blob (autenticado via axios — o store
  // do Vercel Blob é privado, então o backend faz a leitura autenticada e
  // devolve os bytes, igual fazia com o disco local antes), só quando a
  // música tem áudio. Nunca refetcha sozinha (foco de janela etc.): trocar
  // o <audio src> no meio de uma apresentação reseta a reprodução pro início.
  const { data: audioBlob } = useQuery({
    queryKey: ['karaoke-audio', slug, base],
    queryFn: () => api.get(`${base}/songs/${slug}/audio`, { responseType: 'blob' }).then((r) => r.data),
    enabled: hasAudio,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    if (!audioBlob || !audioRef.current) return undefined
    const url = URL.createObjectURL(audioBlob)
    audioRef.current.src = url
    setAudioReady(true)
    return () => URL.revokeObjectURL(url)
  }, [audioBlob])

  const totalMs = useMemo(() => {
    if (hasAudio) return audioDuration ? audioDuration * 1000 : 0
    const seg = data.tempo_execucao_segundos
    if (seg != null && seg > 0) return seg * 1000
    return Math.max(MIN_DURATION_MS, data.lines.length * data.ms_per_line)
  }, [data, hasAudio, audioDuration])

  // ms decorridos, venha de onde vier (áudio real ou cronômetro legado)
  const getElapsedMs = () => (hasAudio ? (audioRef.current?.currentTime || 0) * 1000 : elapsedRef.current)

  const applyOffset = () => {
    const viewport = viewportRef.current
    const sheet = sheetRef.current
    if (!viewport || !sheet) return
    const maxOffset = Math.max(0, sheet.scrollHeight - viewport.clientHeight)
    const frac = totalMs > 0 ? Math.min(1, getElapsedMs() / totalMs) : 0
    const targetTop = frac * maxOffset
    if (Math.abs(viewport.scrollTop - targetTop) > 0.5) {
      programmaticScroll.current = true
      viewport.scrollTop = targetTop
    }
    if (progressFillRef.current) progressFillRef.current.style.width = `${frac * 100}%`
  }

  // busca (seek) pra uma posição em ms — no elemento <audio> real quando a
  // música tem faixa, ou no cronômetro (elapsedRef) no modo legado.
  const seekToMs = (ms) => {
    const clamped = Math.max(0, Math.min(totalMs || 0, ms))
    if (hasAudio) {
      if (audioRef.current) audioRef.current.currentTime = clamped / 1000
    } else {
      elapsedRef.current = clamped
    }
    setElapsedDisplay(clamped / 1000)
    applyOffset()
  }

  useEffect(() => { applyOffset() }, []) // eslint-disable-line

  // o zoom muda o font-size do texto, logo a altura total da cifra
  // (scrollHeight) — recalcula a posição em px pra não deslocar a rolagem
  // quando o usuário aumenta/diminui o zoom no meio da música
  useEffect(() => { applyOffset() }, [zoom]) // eslint-disable-line

  // scroll do mouse, arrasto na barra de rolagem, ou nudgeScroll (setas) —
  // qualquer scrollTop que não veio de applyOffset() é o músico navegando
  // manualmente; busca (seek) pra posição nova, real ou do cronômetro.
  const handleUserScroll = () => {
    if (programmaticScroll.current) { programmaticScroll.current = false; return }
    const viewport = viewportRef.current
    const sheet = sheetRef.current
    if (!viewport || !sheet || !totalMs) return
    const maxOffset = Math.max(0, sheet.scrollHeight - viewport.clientHeight)
    const frac = maxOffset > 0 ? viewport.scrollTop / maxOffset : 0
    seekToMs(Math.max(0, Math.min(1, frac)) * totalMs)
  }

  // avança/volta a rolagem por uma fração da tela — usado pelas setas
  // ↑/↓ (não existe scroll nativo por teclado sem o elemento estar focado)
  const nudgeScroll = (deltaFrac) => {
    const viewport = viewportRef.current
    const sheet = sheetRef.current
    if (!viewport || !sheet) return
    const maxOffset = Math.max(0, sheet.scrollHeight - viewport.clientHeight)
    viewport.scrollTop = Math.max(0, Math.min(maxOffset, viewport.scrollTop + deltaFrac * viewport.clientHeight))
  }

  const goNextSong = () => {
    const nextSlug = playlist.advance()
    if (nextSlug) navigate(`/karaoke/${nextSlug}`, { replace: true })
    else navigate(`/setlists/${playlist.setlistId}`)
  }
  const goPrevSong = () => {
    const prevSlug = playlist.back()
    if (prevSlug) navigate(`/karaoke/${prevSlug}`, { replace: true })
  }
  const stopPlaylist = () => {
    playlist.stop()
    navigate(`/setlists/${playlist.setlistId}`)
  }
  // NÃO avança sozinho pra próxima música da playlist ao terminar — item 6
  // do pedido: só o botão manual "Próxima música" (⏭, goNextSong) avança.
  const onSongEnd = () => {
    setPlaying(false)
  }

  // laço de rolagem legado (sem áudio): avança `elapsedRef` pelo tempo real
  // decorrido entre ticks × velocidade — setInterval (não
  // requestAnimationFrame) porque uma apresentação ao vivo não pode
  // congelar a rolagem se a aba perder o foco (rAF pausa por completo em
  // abas em segundo plano; setInterval só sofre throttling, continua
  // avançando). O cálculo por delta real (não um incremento fixo de 100ms)
  // absorve esse throttling sem perder tempo. Com áudio real, quem avança a
  // rolagem é o evento `timeupdate` do `<audio>` (ver efeito abaixo).
  useEffect(() => {
    if (!playing || hasAudio) return undefined
    let last = Date.now()
    intervalRef.current = setInterval(() => {
      const now = Date.now()
      const dt = now - last
      last = now
      elapsedRef.current = Math.min(totalMs, elapsedRef.current + dt * rate)
      applyOffset()
      setElapsedDisplay(elapsedRef.current / 1000)
      if (elapsedRef.current >= totalMs) {
        clearInterval(intervalRef.current)
        onSongEnd()
      }
    }, 100)
    return () => clearInterval(intervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, hasAudio, rate, totalMs])

  // com áudio real: a rolagem segue o currentTime de verdade a cada
  // `timeupdate` (dispara continuamente durante a reprodução)
  useEffect(() => {
    const audio = audioRef.current
    if (!hasAudio || !audio) return undefined
    const onTimeUpdate = () => {
      applyOffset()
      setElapsedDisplay(audio.currentTime)
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    return () => audio.removeEventListener('timeupdate', onTimeUpdate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAudio, totalMs])

  // play/pause da store (via `playing`) controla o elemento <audio> de verdade
  useEffect(() => {
    if (!hasAudio || !audioRef.current) return
    if (playing) audioRef.current.play().catch(() => setPlaying(false))
    else audioRef.current.pause()
  }, [hasAudio, playing])

  // pausar o karaokê (por qualquer via — botão, hotkey, fim de música)
  // pausa o vídeo do YouTube junto, se houver um tocando. Só a direção de
  // pausar é automática — dar play não deve iniciar o vídeo sozinho, só o
  // botão "Tocar + YT" faz isso (ver playWithYoutube).
  useEffect(() => {
    if (!playing) ytRef.current?.pause()
  }, [playing])

  // velocidade (`rate`, mesmo controle −/+ dos dois modos) também rege o
  // <audio> de verdade quando ele existe
  useEffect(() => {
    if (hasAudio && audioRef.current) audioRef.current.playbackRate = rate
  }, [hasAudio, rate])

  const poke = () => {
    setControlsVisible(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2500)
  }
  useEffect(() => { poke(); return () => clearTimeout(hideTimer.current) }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else stageRef.current?.requestFullscreen?.()
  }

  const togglePlay = () => { if (canPlay) setPlaying((p) => !p) }
  // "Tocar + YT" (item 5): começa o karaokê normalmente E dá play no
  // vídeo do YouTube junto, quando a música tem um link cadastrado.
  const playWithYoutube = () => {
    if (canPlay) setPlaying(true)
    ytRef.current?.play()
  }
  // alterna igual ao botão de play/pause principal — rótulo muda pra
  // "Pausar + YT" enquanto toca; pausar aqui já pausa o vídeo junto (ver
  // o efeito acima, que observa `playing`).
  const toggleWithYoutube = () => {
    if (playing) setPlaying(false)
    else playWithYoutube()
  }
  const restart = () => seekToMs(0)
  const adjustRate = (delta) => setRate((r) => Math.min(MAX_RATE, Math.max(MIN_RATE, +(r + delta).toFixed(2))))
  const seekToFraction = (frac) => seekToMs(Math.max(0, Math.min(1, frac)) * totalMs)

  // ações que o pedal (foot switch) pode disparar nesta página — id do
  // catálogo (config/pedalActions.js) -> handler local; um id sem entrada
  // aqui (ex.: "próxima linha", que só existe em KaraokeStage) vira no-op
  // no runtime do pedal, ver usePedalControl.js.
  const pedalActions = {
    toggle_play: togglePlay,
    scroll_nudge_up: () => nudgeScroll(-0.2),
    scroll_nudge_down: () => nudgeScroll(0.2),
    restart,
    exit: () => navigate(-1),
    toggle_fullscreen: toggleFullscreen,
    zoom_in: zoomIn,
    zoom_out: zoomOut,
    rate_up: () => adjustRate(0.1),
    rate_down: () => adjustRate(-0.1),
    toggle_full_track: togglePlay,
    toggle_with_youtube: toggleWithYoutube,
    ...(inPlaylist ? { next_song: goNextSong, prev_song: goPrevSong, stop_playlist: stopPlaylist } : {}),
  }
  const pedal = usePedalControl(slug, data, pedalActions)

  useHotkeys({
    Space: togglePlay,
    ArrowUp: () => nudgeScroll(-0.2),
    ArrowDown: () => nudgeScroll(0.2),
    r: restart,
    R: restart,
    Escape: () => navigate(-1),
    f: toggleFullscreen,
    F: toggleFullscreen,
    '+': zoomIn,
    '=': zoomIn,
    '-': zoomOut,
    '_': zoomOut,
    // totalMs entra nas deps porque, com áudio, ele começa em 0 e só vira o
    // valor real quando os metadados carregam (onLoadedMetadata) — sem
    // isso, restart() (via seekToMs) ficaria preso usando um totalMs de 0
    // (closure velha) até a próxima mudança de canPlay.
  }, [canPlay, totalMs])

  return (
    <div ref={stageRef}
      className={`karaoke-stage${controlsVisible ? ' controls-visible' : ''}`}
      style={{ '--k-zoom': zoom, '--k-sidebar-w': chordSidebarVisible ? `${chordSidebarWidth + 10}px` : '0px' }}
      onMouseMove={poke} onClick={poke}>

      {hasAudio && (
        <audio ref={audioRef} preload="auto"
          onLoadedMetadata={(e) => setAudioDuration(e.target.duration)}
          onEnded={onSongEnd} />
      )}
      {pedal.modoPedal === 'fila_clipes' && <audio ref={pedal.clipAudioRef} preload="auto" />}
      {youtubeVideoId && <YoutubeMiniPlayer ref={ytRef} videoId={youtubeVideoId} title={data.titulo} />}

      <div className="k-header">
        <div>
          {inPlaylist && <>{t('header.playlistPrefix', { name: playlist.setlistNome, current: playlist.index + 1, total: playlist.queue.length })}</>}
          {data.titulo} — {data.interprete} {data.tom && <>· {t('header.tom', { tom: data.tom })}</>} · 📜 {t('header.scrollBadge')}
          {(branding?.has_logo || branding?.band_name) && (
            <div className="k-brand">
              {branding.has_logo && <img src={`/api/branding/${data.owner_id}/logo?theme=dark`} alt="" />}
              {branding.band_name && <span>{branding.band_name}</span>}
            </div>
          )}
        </div>
        <div>
          {formatTime(elapsedDisplay)} / {formatTime(totalMs / 1000)} · {rate.toFixed(1)}x · {t('status.zoom', { percent: Math.round(zoom * 100) })}
          {hasAudio && !audioReady && <> · {t('status.loadingAudio')}</>}
        </div>
      </div>

      <div className="k-body">
        <div className="scroll-viewport" ref={viewportRef} onScroll={handleUserScroll}>
          <div className="scroll-sheet" ref={sheetRef}>
            {data.lines.map((l, i) => (
              <div key={i} className={`scroll-line${CHORD_LIKE.has(l.tipo) ? ' chord' : ''}`}>
                {l.text || ' '}
              </div>
            ))}
          </div>
        </div>
        <KaraokeChordSidebar chords={uniqueChords} instruments={chordInstruments}
          songInfo={{ titulo: data.titulo, interprete: data.interprete, tom: data.tom, velocidade: data.velocidade }} />
      </div>

      <div className="k-progress audio-mode"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          seekToFraction((e.clientX - rect.left) / rect.width)
        }}>
        <div ref={progressFillRef} />
      </div>

      <div className="k-controls no-print">
        {inPlaylist && (
          <button className="btn" onClick={goPrevSong} disabled={playlist.index === 0} title={t('controls.prevSong')}>⏮</button>
        )}
        <button className="btn" onClick={restart} title={t('controls.restart')}>⟲</button>
        <button className="btn primary" onClick={togglePlay} disabled={!canPlay} title={t('controls.playPause')}>
          {playing ? t('controls.pause') : t('controls.play')}
        </button>
        {youtubeVideoId && (
          <button className="btn" onClick={toggleWithYoutube} disabled={!canPlay}
            title={t('controls.playWithYoutubeTitle')}>
            {playing ? t('controls.pauseWithYoutube') : t('controls.playWithYoutube')}
          </button>
        )}
        <button className="btn" onClick={() => adjustRate(-0.1)} title={t('controls.slower')}>−</button>
        <button className="btn" onClick={() => adjustRate(0.1)} title={t('controls.faster')}>+</button>
        <button className="btn" onClick={zoomOut} title={t('controls.zoomOut')}>A−</button>
        <button className="btn" onClick={zoomIn} title={t('controls.zoomIn')}>A+</button>
        {inPlaylist && <>
          <button className="btn" onClick={goNextSong} title={t('controls.nextSong')}>⏭</button>
          <button className="btn danger" onClick={stopPlaylist} title={t('controls.stopPlaylist')}>■</button>
        </>}
        <button className="btn" onClick={toggleFullscreen} title={t('controls.fullscreen')}>⛶</button>
        <button className="btn ghost" onClick={() => navigate(-1)} title={t('controls.back')}>{t('controls.exit')}</button>
      </div>
    </div>
  )
}
