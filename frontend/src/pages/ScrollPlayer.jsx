import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
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
import PedalStatusBadge from '../components/PedalStatusBadge'
import { extractYoutubeId } from '../utils/youtube'
import { playClick } from '../utils/clickSound'

const CHORD_LIKE = new Set(['acorde', 'solo', 'riff', 'tab'])
const MIN_RATE = 0.5
const MAX_RATE = 2
const MIN_DURATION_MS = 3000
const COUNTDOWN_SECONDS = 3

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
  const [countdown, setCountdown] = useState(null) // null = sem contagem; número = segundos restantes
  const countdownTimer = useRef(null)
  const countdownOnDoneRef = useRef(null)

  const inPlaylist = playlist.active && playlist.queue[playlist.index]?.song?.slug === slug

  // medley (ver SetlistDetail.jsx::buildMedleyItems): quando a música atual
  // da fila tem `medley_id` e é a primeira do grupo, esta música vira a
  // "âncora" — busca as outras do grupo (mesma queryKey/staleTime que
  // KaraokePlayer.jsx usa pra buscar uma música, cache compartilhado) e
  // concatena tudo numa rolagem só (combinedLines/combinedTotalMs abaixo).
  // Só música em modo rolagem entra num medley (garantido na criação), não
  // precisa checar modo_execucao de novo aqui.
  const currentQueueEntry = inPlaylist ? playlist.queue[playlist.index] : null
  const medleyId = currentQueueEntry?.medley_id || null
  const isMedleyAnchor = Boolean(medleyId) &&
    (playlist.index === 0 || playlist.queue[playlist.index - 1]?.medley_id !== medleyId)
  const medleyMemberSlugs = useMemo(() => {
    if (!isMedleyAnchor) return []
    const slugs = []
    let i = playlist.index + 1
    while (i < playlist.queue.length && playlist.queue[i].medley_id === medleyId) {
      slugs.push(playlist.queue[i].song.slug)
      i += 1
    }
    return slugs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMedleyAnchor, medleyId, playlist.index, playlist.queue])
  const medleyMemberQueries = useQueries({
    queries: medleyMemberSlugs.map((s) => ({
      queryKey: ['karaoke', s, base],
      queryFn: () => api.get(`${base}/karaoke/${s}`).then((r) => r.data),
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    })),
  })
  const medleyReady = medleyMemberQueries.every((q) => q.data)

  // dentro de um medley a rolagem NUNCA segue áudio real de nenhuma música
  // (nem da âncora, mesmo que tenha faixa enviada) — sincronizar N faixas
  // distintas num timeline só, buscável, é escopo bem maior que o pedido;
  // usa sempre o cronômetro legado (ms_per_line/tempo_execucao de cada
  // música, somados — ver totalMs). Vídeo do YouTube (se usado) também
  // mostra só o da âncora, sem trocar sozinho no meio do medley.
  const effectiveHasAudio = hasAudio && !isMedleyAnchor
  const canPlay = !effectiveHasAudio || audioReady

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
    clearInterval(countdownTimer.current)
    setCountdown(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // feedback da plateia (QR code, ver SetlistDetail.jsx/FeedbackQRModal.jsx):
  // avisa o backend qual música está tocando agora, sempre que a música
  // troca dentro de uma setlist — fire-and-forget, nunca atrasa a troca de
  // música; o backend decide se há sessão de feedback ativa pra atualizar
  // (FeedbackService.set_current_song é no-op silencioso senão).
  useEffect(() => {
    if (!inPlaylist) return
    api.post(`/setlists/${playlist.setlistId}/feedback/current-song`, { slug }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, inPlaylist])

  // faixa de referência: buscada como Blob (autenticado via axios — o store
  // do Vercel Blob é privado, então o backend faz a leitura autenticada e
  // devolve os bytes, igual fazia com o disco local antes), só quando a
  // música tem áudio. Nunca refetcha sozinha (foco de janela etc.): trocar
  // o <audio src> no meio de uma apresentação reseta a reprodução pro início.
  const { data: audioBlob } = useQuery({
    queryKey: ['karaoke-audio', slug, base],
    queryFn: () => api.get(`${base}/songs/${slug}/audio`, { responseType: 'blob' }).then((r) => r.data),
    enabled: effectiveHasAudio,
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

  // duração de UMA música pelo cronômetro legado — reaproveitada tanto pro
  // caso normal quanto pra somar a duração de cada membro do medley. Conta só
  // linhas de letra/acorde: observação, solo, riff, tablatura, seção etc.
  // podem ocupar muitas linhas na tela sem corresponder a tempo real de
  // execução (ex.: uma tablatura de 6 linhas pra um riff de poucos segundos)
  // — contar essas linhas junto inflava a duração estimada bem além do real.
  const legacyDurationMs = (song) => {
    const seg = song.tempo_execucao_segundos
    if (seg != null && seg > 0) return seg * 1000
    const countableLines = song.lines.filter((l) => l.tipo === 'letra' || l.tipo === 'acorde').length
    return Math.max(MIN_DURATION_MS, countableLines * song.ms_per_line)
  }

  const totalMs = useMemo(() => {
    if (isMedleyAnchor) {
      if (!medleyReady) return 0
      const payloads = [data, ...medleyMemberQueries.map((q) => q.data)]
      return payloads.reduce((sum, p) => sum + legacyDurationMs(p), 0)
    }
    if (effectiveHasAudio) return audioDuration ? audioDuration * 1000 : 0
    return legacyDurationMs(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, effectiveHasAudio, audioDuration, isMedleyAnchor, medleyReady, medleyMemberQueries])

  // rolagem concatenada do medley: junta as `lines` de cada música do grupo,
  // inserindo um bloco de aviso "MEDLEY: <próxima>" entre elas (item.tipo
  // exclusivo, tratado à parte no render abaixo — nunca colide com os tipos
  // vindos do parser, ver utils/parser.py). Fora de um medley, é só
  // `data.lines` mesmo, sem cópia.
  const combinedLines = useMemo(() => {
    if (!isMedleyAnchor || !medleyReady) return data.lines
    const payloads = [data, ...medleyMemberQueries.map((q) => q.data)]
    const out = []
    payloads.forEach((p, i) => {
      if (i > 0) out.push({ tipo: 'medley-divider', text: t('medleyDivider', { nome: p.titulo }) })
      out.push(...p.lines)
    })
    return out
  }, [isMedleyAnchor, medleyReady, data, medleyMemberQueries, t])

  // ms decorridos, venha de onde vier (áudio real ou cronômetro legado)
  const getElapsedMs = () => (effectiveHasAudio ? (audioRef.current?.currentTime || 0) * 1000 : elapsedRef.current)

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
    if (effectiveHasAudio) {
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

  // sai do player de volta pra tela da setlist, já com foco na música em
  // que o músico estava — sem isso, "sair" sempre voltava pro topo da
  // lista, obrigando a rolar até achar a música de novo (ver
  // SetlistDetail.jsx, que lê state.focusSlug pra rolar/destacar a linha).
  const goToSetlist = (focusSlug) => navigate(`/setlists/${playlist.setlistId}`, { state: { focusSlug } })

  const goNextSong = () => {
    const nextSlug = playlist.advance()
    if (nextSlug) navigate(`/karaoke/${nextSlug}`, { replace: true })
    else goToSetlist(slug)
  }
  const goPrevSong = () => {
    const prevSlug = playlist.back()
    if (prevSlug) navigate(`/karaoke/${prevSlug}`, { replace: true })
  }
  const stopPlaylist = () => {
    playlist.stop()
    goToSetlist(slug)
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
    if (!playing || effectiveHasAudio) return undefined
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
  }, [playing, effectiveHasAudio, rate, totalMs])

  // com áudio real: a rolagem segue o currentTime de verdade a cada
  // `timeupdate` (dispara continuamente durante a reprodução)
  useEffect(() => {
    const audio = audioRef.current
    if (!effectiveHasAudio || !audio) return undefined
    const onTimeUpdate = () => {
      applyOffset()
      setElapsedDisplay(audio.currentTime)
    }
    audio.addEventListener('timeupdate', onTimeUpdate)
    return () => audio.removeEventListener('timeupdate', onTimeUpdate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveHasAudio, totalMs])

  // play/pause da store (via `playing`) controla o elemento <audio> de verdade
  useEffect(() => {
    if (!effectiveHasAudio || !audioRef.current) return
    if (playing) audioRef.current.play().catch(() => setPlaying(false))
    else audioRef.current.pause()
  }, [effectiveHasAudio, playing])

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
    if (effectiveHasAudio && audioRef.current) audioRef.current.playbackRate = rate
  }, [effectiveHasAudio, rate])

  const poke = () => {
    setControlsVisible(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2500)
  }
  useEffect(() => { poke(); return () => clearTimeout(hideTimer.current) }, [])
  useEffect(() => () => clearInterval(countdownTimer.current), [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else stageRef.current?.requestFullscreen?.()
  }

  // contagem regressiva de 3s antes de começar a tocar do início (mesmo
  // recurso do modo Karaokê, KaraokeStage.jsx::startCountdown/skipCountdown)
  // — só dispara ao dar play perto do começo da música (retomar de uma
  // pausa no meio não conta de novo). `countdownOnDoneRef` guarda o que
  // fazer ao terminar (ou ao pular clicando/apertando Espaço de novo),
  // pra "Tocar + YT" poder também iniciar o vídeo no mesmo instante.
  const startCountdown = (onDone) => {
    countdownOnDoneRef.current = onDone
    setCountdown(COUNTDOWN_SECONDS)
    playClick()
    clearInterval(countdownTimer.current)
    countdownTimer.current = setInterval(() => {
      playClick()
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownTimer.current)
          countdownOnDoneRef.current?.()
          return null
        }
        return c - 1
      })
    }, 1000)
  }
  const skipCountdown = () => {
    clearInterval(countdownTimer.current)
    setCountdown(null)
    countdownOnDoneRef.current?.()
  }
  const beginPlayback = (onStart) => {
    if (countdown != null) return
    const nearStart = getElapsedMs() < 500
    const start = () => { setPlaying(true); onStart?.() }
    if (nearStart) startCountdown(start)
    else start()
  }

  const togglePlay = () => {
    if (!canPlay) return
    if (countdown != null) { skipCountdown(); return }
    if (playing) setPlaying(false)
    else beginPlayback()
  }
  // "Tocar + YT" (item 5): começa o karaokê normalmente E dá play no
  // vídeo do YouTube junto, quando a música tem um link cadastrado.
  const playWithYoutube = () => {
    if (!canPlay) return
    if (countdown != null) { skipCountdown(); return }
    beginPlayback(() => ytRef.current?.play())
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

  // veio de uma setlist: sair volta pra ela com foco nesta música (ver
  // goToSetlist acima); senão, comportamento de sempre (voltar uma página).
  const exitPlayer = () => { if (inPlaylist) goToSetlist(slug); else navigate(-1) }

  // ações que o pedal (foot switch) pode disparar nesta página — id do
  // catálogo (config/pedalActions.js) -> handler local; um id sem entrada
  // aqui (ex.: "próxima linha", que só existe em KaraokeStage) vira no-op
  // no runtime do pedal, ver usePedalControl.js.
  const pedalActions = {
    toggle_play: togglePlay,
    scroll_nudge_up: () => nudgeScroll(-0.2),
    scroll_nudge_down: () => nudgeScroll(0.2),
    restart,
    exit: exitPlayer,
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
    Escape: exitPlayer,
    f: toggleFullscreen,
    F: toggleFullscreen,
    '+': zoomIn,
    '=': zoomIn,
    '-': zoomOut,
    '_': zoomOut,
    // totalMs entra nas deps porque, com áudio, ele começa em 0 e só vira o
    // valor real quando os metadados carregam (onLoadedMetadata) — sem
    // isso, restart() (via seekToMs) ficaria preso usando um totalMs de 0
    // (closure velha) até a próxima mudança de canPlay. inPlaylist entra
    // pelo mesmo motivo pro exitPlayer (closure de slug/inPlaylist) —
    // trocar de música dentro de uma playlist reusa o mesmo componente
    // (replace:true), não remonta. countdown entra pelo mesmo motivo — Space
    // precisa de uma closure atual pra pular a contagem em vez de pausar.
  }, [canPlay, totalMs, inPlaylist, countdown])

  return (
    <div ref={stageRef}
      className={`karaoke-stage${controlsVisible ? ' controls-visible' : ''}`}
      style={{ '--k-zoom': zoom, '--k-sidebar-w': chordSidebarVisible ? `${chordSidebarWidth + 10}px` : '0px' }}
      onMouseMove={poke} onClick={poke}>

      {effectiveHasAudio && (
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
          {effectiveHasAudio && !audioReady && <> · {t('status.loadingAudio')}</>}
          {isMedleyAnchor && !medleyReady && <> · {t('status.loadingMedley')}</>}
          {' '}<PedalStatusBadge />
        </div>
      </div>

      <div className="k-body">
        <div className="scroll-viewport" ref={viewportRef} onScroll={handleUserScroll}>
          <div className="scroll-sheet" ref={sheetRef}>
            {combinedLines.map((l, i) => (
              <div key={i} className={
                l.tipo === 'medley-divider' ? 'scroll-line medley-divider'
                  : `scroll-line${CHORD_LIKE.has(l.tipo) ? ' chord' : ''}`
              }>
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
          {countdown != null ? t('controls.skipCountdown', { count: countdown }) : playing ? t('controls.pause') : t('controls.play')}
        </button>
        {youtubeVideoId && (
          <button className="btn" onClick={toggleWithYoutube} disabled={!canPlay}
            title={t('controls.playWithYoutubeTitle')}>
            {countdown != null ? t('controls.skipCountdown', { count: countdown })
              : playing ? t('controls.pauseWithYoutube') : t('controls.playWithYoutube')}
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
        <button className="btn" onClick={() => navigate(`/musicas/${slug}`, { state: { fromKaraoke: true, initialTab: 'edit' } })}
          title={t('controls.editTitle')}>{t('controls.edit')}</button>
        <button className="btn ghost" onClick={exitPlayer} title={t('controls.back')}>{t('controls.exit')}</button>
      </div>

      {countdown != null && (
        <div className="k-countdown" onClick={skipCountdown}>
          <div key={countdown} className="k-countdown-number">{countdown}</div>
          <div className="k-countdown-label">{t('countdown.hint')}</div>
        </div>
      )}
    </div>
  )
}
