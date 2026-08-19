import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { usePublicApiBase } from '../utils/publicApiBase'
import { usePlayerStore } from '../store/playerStore'
import { usePlaylistStore } from '../store/playlistStore'
import { useZoomStore } from '../store/zoomStore'
import { useHotkeys } from '../hooks/useHotkeys'
import { useAudioSync } from '../hooks/useAudioSync'
import { usePedalControl } from '../hooks/usePedalControl'
import { resolveTimeline, estimateSynthDuration } from '../utils/timeline'
import { buildStepWindow } from '../utils/steps'
import { playClick } from '../utils/clickSound'
import { buildChordTimeline } from '../utils/chordTimeline'
import { buildBeatGrid } from '../utils/beatGrid'
import { BandSynth } from '../utils/bandSynth'
import { SynthClock } from '../utils/synthClock'
import { extractUniqueChords } from '../utils/chordParser'
import { useChordSidebarStore } from '../store/chordSidebarStore'
import KaraokeLines from '../components/KaraokeLines'
import KaraokeChordSidebar from '../components/KaraokeChordSidebar'
import YoutubeMiniPlayer from '../components/YoutubeMiniPlayer'
import { extractYoutubeId } from '../utils/youtube'

const ROW_BUDGET = 16
const COUNTDOWN_SECONDS = 3

/**
 * PLAYER KARAOKÊ (modo "karaoke", ver @modoexecucao) — tela cheia, fundo
 * preto, fonte branca. Montado por KaraokePlayer.jsx quando a música está
 * marcada para esse modo; o modo padrão "rolagem" usa ScrollPlayer.jsx.
 * Janela por orçamento de linhas físicas (ver utils/steps.js): um passo
 * acorde+letra ocupa 2 linhas, os demais 1. O passo em execução (pos-0) é
 * destacado em âmbar/amarelo. O tipo de cada linha (letra/acorde/
 * observação/solo/riff/tab/secao/sample) já vem classificado pelo backend.
 *
 * Três frentes de sincronismo:
 *  - `hasAudio` (há faixa de referência enviada): o áudio real toca via
 *    <audio>, e o índice de linha + a varredura de cor estilo CDG + o
 *    disparo de samples seguem o `currentTime` real (useAudioSync).
 *  - `synthMode` (sem áudio, mas com @bpm + algum instrumento ligado): um
 *    `SynthClock` (utils/synthClock.js) imita a mesma interface de
 *    <audio> que `useAudioSync` consome, tocando de verdade um
 *    acompanhamento sintetizado (utils/bandSynth.js) a partir dos acordes
 *    da cifra — o resto do motor de sincronismo nem sabe a diferença.
 *  - modo legado (nem um nem outro): cronômetro fixo de `ms_per_line`,
 *    como sempre funcionou — inalterado, para não regredir o acervo
 *    existente. `audioMode` = `hasAudio || synthMode` liga as duas
 *    primeiras frentes; só `hasAudio` decide se o elemento `<audio>` real
 *    é montado.
 */
export default function KaraokeStage() {
  const { t } = useTranslation('karaokeStage')
  const { slug } = useParams()
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const base = usePublicApiBase()
  const player = usePlayerStore()
  const playlist = usePlaylistStore()
  const { zoom, zoomIn, zoomOut } = useZoomStore()
  const [progress, setProgress] = useState(0) // modo legado (progresso dentro da linha)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [audioDuration, setAudioDuration] = useState(null)
  const [audioReady, setAudioReady] = useState(false)
  const [rate, setRate] = useState(1)
  const [sampleUrls, setSampleUrls] = useState({})
  const hideTimer = useRef(null)
  const stageRef = useRef(null)
  const audioRef = useRef(null)
  const sweepRootRef = useRef(null)
  const progressFillRef = useRef(null)
  const sampleAudioRefs = useRef({})
  const autoStartedRef = useRef(null)
  const [countdown, setCountdown] = useState(null) // null = sem contagem; número = segundos restantes
  const countdownTimer = useRef(null)
  const ytRef = useRef(null)

  // a rota /karaoke/:slug não desmonta o componente ao trocar de música
  // (mesmo elemento de rota) — precisa resetar manualmente o que é
  // específico da faixa anterior a cada troca de slug (ex.: tocando uma
  // playlist, música após música).
  useEffect(() => {
    setAudioDuration(null)
    setAudioReady(false)
    clearInterval(countdownTimer.current)
    setCountdown(null)
  }, [slug])

  // só considera "dentro de uma playlist" se a música atual da tela é
  // mesmo a música atual da fila — evita ativar os controles de playlist
  // por causa de um estado esquecido de uma sessão anterior
  const inPlaylist = playlist.active && playlist.queue[playlist.index]?.song?.slug === slug

  // staleTime/refetchOnWindowFocus desligados: um refetch em segundo plano
  // (ex.: o navegador recupera o foco durante o show) chamaria player.load()
  // de novo e resetaria a reprodução para o início — não é o que se quer
  // no meio de uma apresentação.
  const { data, isLoading } = useQuery({
    queryKey: ['karaoke', slug, base],
    queryFn: () => api.get(`${base}/karaoke/${slug}`).then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  // marca própria do dono da música (Fase 8) — rota pública (sem auth),
  // igual a folha de cifra em si não exige login pra ser exibida no palco.
  const { data: branding } = useQuery({
    queryKey: ['branding-info', data?.owner_id],
    queryFn: () => api.get(`/branding/${data.owner_id}`).then((r) => r.data),
    enabled: Boolean(data?.owner_id),
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
  const uniqueChords = useMemo(() => extractUniqueChords(data?.lines), [data?.lines])
  const chordSidebarVisible = chordInstruments.length > 0 && uniqueChords.length > 0
  const chordSidebarWidth = useChordSidebarStore((s) => s.width)
  const youtubeVideoId = extractYoutubeId(data?.youtube_url)

  useEffect(() => {
    if (data) player.load(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // faixa de referência: buscada como Blob (autenticado via axios — o store
  // do Vercel Blob é privado, então o backend lê autenticado e devolve os
  // bytes, igual fazia com o disco local antes) — só quando existe, e sem
  // travar o resto da tela enquanto baixa. Nunca refetcha sozinha (foco de
  // janela, remount etc.) — trocar o <audio src> no meio de uma
  // apresentação reseta a reprodução (volta pro início).
  const { data: audioBlob } = useQuery({
    queryKey: ['karaoke-audio', slug, base],
    queryFn: () => api.get(`${base}/songs/${slug}/audio`, { responseType: 'blob' }).then((r) => r.data),
    enabled: Boolean(data?.has_audio),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    if (!audioBlob || !audioRef.current) return
    const url = URL.createObjectURL(audioBlob)
    audioRef.current.src = url
    setAudioReady(true)
    return () => URL.revokeObjectURL(url)
  }, [audioBlob])

  // samples: cada um vira um <audio> próprio, pré-carregado como Blob
  useEffect(() => {
    let cancelled = false
    setSampleUrls({})
    if (!data?.has_audio || !player.samples.length) return undefined
    Promise.all(player.samples.map((s) =>
      api.get(`${base}/songs/${slug}/samples/${s.id}`, { responseType: 'blob' })
        .then((r) => [s.id, URL.createObjectURL(r.data)])
        .catch(() => [s.id, null]),
    )).then((pairs) => { if (!cancelled) setSampleUrls(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, data?.has_audio, player.samples.length, base])

  useEffect(() => () => {
    Object.values(sampleUrls).forEach((u) => u && URL.revokeObjectURL(u))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // duração real (via onLoadedMetadata, só quando há áudio de verdade) ou
  // estimada (sem âncora suficiente pra saber o fim exato da música só-
  // sintetizada, ver utils/timeline.js::estimateSynthDuration)
  const synthDuration = useMemo(
    () => (player.synthMode ? estimateSynthDuration(player.steps, player.bpm) : null),
    [player.synthMode, player.steps, player.bpm],
  )
  const effectiveDuration = player.hasAudio ? audioDuration : synthDuration

  // passos (acorde+letra já agrupados, ver utils/steps.js) com tempo
  // resolvido (âncoras [t=SEG] + interpolação) — só em modo áudio
  const resolvedSteps = useMemo(
    () => (player.audioMode ? resolveTimeline(player.steps, effectiveDuration, player.msPerLine) : []),
    [player.audioMode, player.steps, effectiveDuration, player.msPerLine],
  )

  // linha do tempo de acordes + grade de batidas do acompanhamento
  // sintetizado — só quando ele está de fato ligado nesta música
  const chordTimeline = useMemo(
    () => (player.synthMode && effectiveDuration != null ? buildChordTimeline(resolvedSteps, effectiveDuration) : []),
    [player.synthMode, resolvedSteps, effectiveDuration],
  )
  const beatGrid = useMemo(
    () => (player.synthMode && player.bpm && effectiveDuration != null ? buildBeatGrid(player.bpm, effectiveDuration) : null),
    [player.synthMode, player.bpm, effectiveDuration],
  )

  // cria/destrói o AudioContext + BandSynth + SynthClock a cada troca de
  // música (a rota não desmonta o componente numa playlist) — precisa vir
  // ANTES do useAudioSync(...) abaixo na ordem dos hooks, pra garantir que
  // audioRef.current já aponte pro SynthClock quando o efeito dele rodar.
  useEffect(() => {
    if (!player.synthMode || effectiveDuration == null || !beatGrid) return undefined
    const Ctor = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctor()
    const bandSynth = new BandSynth(ctx, {
      chordTimeline, beatGrid: beatGrid.beats, instruments: player.instrumentos, duration: effectiveDuration,
    })
    const clock = new SynthClock(ctx, bandSynth, { duration: effectiveDuration })
    audioRef.current = clock
    return () => { clock.pause(); ctx.close() }
  }, [player.synthMode, slug, chordTimeline, beatGrid, effectiveDuration, player.instrumentos])

  useAudioSync({
    audioRef, resolvedLines: resolvedSteps, samples: player.samples, sampleAudioRefs,
    sweepRootRef, progressFillRef, audioDuration: effectiveDuration, onIndexChange: player.setIndex,
  })

  // relógio legado: avança 1 linha a cada msPerLine (só quando não há áudio)
  useEffect(() => {
    if (player.audioMode) return
    if (!player.playing) return
    const startedAt = performance.now()
    const tick = setInterval(() => {
      setProgress(Math.min(1, (performance.now() - startedAt) / player.msPerLine))
    }, 100)
    const step = setTimeout(() => {
      if (player.atEnd()) onSongEnd()
      else player.next()
      setProgress(0)
    }, player.msPerLine)
    return () => { clearTimeout(step); clearInterval(tick) }
  }, [player.audioMode, player.playing, player.index, player.msPerLine]) // eslint-disable-line

  // modo áudio: play/pause da store controla o elemento <audio>
  useEffect(() => {
    if (!player.audioMode || !audioRef.current) return
    if (player.playing) audioRef.current.play().catch(() => player.pause())
    else audioRef.current.pause()
  }, [player.audioMode, player.playing]) // eslint-disable-line

  // pausar o karaokê (por qualquer via — botão, hotkey, fim de música)
  // pausa o vídeo do YouTube junto, se houver um tocando. Só a direção de
  // pausar é automática — dar play não deve iniciar o vídeo sozinho, só o
  // botão "Tocar + YT" faz isso (ver playWithYoutube).
  useEffect(() => {
    if (!player.playing) ytRef.current?.pause()
  }, [player.playing])

  // auto-ocultar controles
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

  const canPlay = !player.audioMode || (player.hasAudio ? audioReady : effectiveDuration != null)

  const seekToIndex = (i) => {
    if (!resolvedSteps.length) return
    const clamped = Math.max(0, Math.min(i, resolvedSteps.length - 1))
    if (audioRef.current) audioRef.current.currentTime = resolvedSteps[clamped].t
  }
  const seekToFraction = (frac) => {
    if (!audioRef.current || !effectiveDuration) return
    audioRef.current.currentTime = Math.max(0, Math.min(1, frac)) * effectiveDuration
  }
  const restart = () => {
    if (player.audioMode) { if (audioRef.current) audioRef.current.currentTime = 0 }
    else { player.restart(); setProgress(0) }
  }
  const goPrev = () => {
    if (player.audioMode) seekToIndex(player.index - 1)
    else { player.prev(); setProgress(0) }
  }
  const goNext = () => {
    if (player.audioMode) seekToIndex(player.index + 1)
    else { player.next(); setProgress(0) }
  }
  const adjustRate = (delta) => {
    if (player.audioMode) {
      if (!audioRef.current) return
      const next = Math.min(1.5, Math.max(0.5, +(rate + delta).toFixed(2)))
      audioRef.current.playbackRate = next
      setRate(next)
    } else if (delta > 0) player.faster()
    else player.slower()
  }
  // contagem regressiva antes de CADA execução de uma música sincronizada
  // (áudio real) — dispara sempre que o áudio está no começo (currentTime
  // ~0), tanto ao abrir/retomar a música manualmente quanto ao avançar
  // automaticamente pra próxima música de uma playlist. Retomar de uma
  // pausa no meio da música não conta (currentTime já não está no início).
  // Cada número (3, 2, 1) vem com um clique de baqueta — inclusive o
  // instante final, quando a contagem acaba e a música começa de verdade,
  // como um baterista contando "1-2-3-4" com a última batida coincidindo
  // com a entrada da banda.
  const startCountdown = (onDone) => {
    setCountdown(COUNTDOWN_SECONDS)
    playClick()
    clearInterval(countdownTimer.current)
    countdownTimer.current = setInterval(() => {
      playClick()
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownTimer.current)
          onDone()
          return null
        }
        return c - 1
      })
    }, 1000)
  }
  const skipCountdown = () => {
    clearInterval(countdownTimer.current)
    setCountdown(null)
    player.play()
  }
  const beginPlayback = () => {
    if (countdown != null) return
    const nearStart = !audioRef.current || audioRef.current.currentTime < 0.5
    if (player.audioMode && nearStart) startCountdown(() => player.play())
    else player.play()
  }
  const togglePlay = () => {
    if (!canPlay) return
    if (countdown != null) { skipCountdown(); return }
    if (player.playing) player.pause()
    else beginPlayback()
  }
  // "Tocar + YT" (item 5): começa o karaokê normalmente E dá play no
  // vídeo do YouTube junto, quando a música tem um link cadastrado.
  const playWithYoutube = () => {
    beginPlayback()
    ytRef.current?.play()
  }
  // alterna igual ao botão de play/pause principal — rótulo muda pra
  // "Pausar + YT" enquanto toca; pausar aqui já pausa o vídeo junto (ver
  // o efeito acima, que observa player.playing).
  const toggleWithYoutube = () => {
    if (player.playing) player.pause()
    else playWithYoutube()
  }

  // navegação entre músicas de uma playlist ativa — distinta da navegação
  // por linha (← →) já existente
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

  // ações que o pedal (foot switch) pode disparar nesta página — id do
  // catálogo (config/pedalActions.js) -> handler local; um id sem entrada
  // aqui vira no-op no runtime do pedal, ver usePedalControl.js.
  const pedalActions = {
    toggle_play: togglePlay,
    next_line: goNext,
    prev_line: goPrev,
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
  // NÃO avança sozinho pra próxima música da playlist ao terminar — item 6
  // do pedido: só o botão manual "Próxima música" (⏭, goNextSong) avança.
  const onSongEnd = () => { player.pause() }

  // fim de música em modo sintetizado: não existe elemento <audio> real
  // pra disparar onEnded, então escuta o evento 'ended' que o SynthClock
  // já dispara sozinho (ver utils/synthClock.js)
  useEffect(() => {
    const clock = audioRef.current
    if (!player.synthMode || !(clock instanceof SynthClock)) return undefined
    const handler = () => onSongEnd()
    clock.addEventListener('ended', handler)
    return () => clock.removeEventListener('ended', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.synthMode, slug])

  // reprodução contínua: ao entrar numa música nova dentro de uma playlist
  // ativa, retoma o play assim que ela estiver pronta. Precisa esperar
  // `data.slug === slug` (ou seja, que o efeito de player.load(data) já
  // rodou pra ESTA música) — senão o load() que ainda vai rodar reseta
  // playing:false por cima do play() que acabamos de disparar aqui.
  useEffect(() => {
    if (!data || data.slug !== slug) return
    if (!inPlaylist || !canPlay) return
    if (autoStartedRef.current === slug) return
    autoStartedRef.current = slug
    beginPlayback()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, inPlaylist, canPlay, slug])

  useHotkeys({
    Space: togglePlay,
    ArrowLeft: goPrev,
    ArrowRight: goNext,
    ArrowUp: () => adjustRate(0.1),
    ArrowDown: () => adjustRate(-0.1),
    r: restart,
    R: restart,
    Escape: () => navigate(-1),
    f: toggleFullscreen,
    F: toggleFullscreen,
    '+': zoomIn,
    '=': zoomIn,
    '-': zoomOut,
    '_': zoomOut,
  }, [player, canPlay, resolvedSteps, rate, countdown])

  if (isLoading || !data) {
    return <div className="karaoke-stage controls-visible"
      style={{ display: 'grid', placeItems: 'center' }}>{t('loading')}</div>
  }

  // JANELA POR ORÇAMENTO DE LINHAS FÍSICAS — um passo 'pair' (acorde+letra)
  // ocupa 2 linhas; um passo 'single' ocupa 1. Nunca ultrapassa ROW_BUDGET.
  const lineWindow = buildStepWindow(player.steps, player.index, ROW_BUDGET)

  // mesma janela, mas a partir dos passos com TEMPO RESOLVIDO — só em modo
  // áudio, pra desenhar a mini-linha do tempo vertical (item 6) com o
  // espaçamento proporcional ao tempo real entre os passos visíveis.
  const timelineWindow = player.audioMode ? buildStepWindow(resolvedSteps, player.index, ROW_BUDGET) : []

  return (
    <div ref={stageRef}
      className={`karaoke-stage${controlsVisible ? ' controls-visible' : ''}`}
      style={{ '--k-zoom': zoom, '--k-sidebar-w': chordSidebarVisible ? `${chordSidebarWidth + 10}px` : '0px' }}
      onMouseMove={poke} onClick={poke}>

      {player.hasAudio && (
        <audio ref={audioRef} preload="auto"
          onLoadedMetadata={(e) => setAudioDuration(e.target.duration)}
          onEnded={onSongEnd} />
      )}
      {player.audioMode && player.samples.map((s) => (
        <audio key={s.id} ref={(el) => { sampleAudioRefs.current[s.id] = el }}
          src={sampleUrls[s.id] || undefined} preload="auto" />
      ))}
      {pedal.modoPedal === 'fila_clipes' && <audio ref={pedal.clipAudioRef} preload="auto" />}
      {youtubeVideoId && <YoutubeMiniPlayer ref={ytRef} videoId={youtubeVideoId} title={data.titulo} />}

      <div className="k-header">
        <div>
          {inPlaylist && <>{t('header.playlistPrefix', { name: playlist.setlistNome, current: playlist.index + 1, total: playlist.queue.length })}</>}
          {data.titulo} — {data.interprete} {data.tom && <>· {t('header.tom', { tom: data.tom })}</>}
          {player.synthMode && <> · 🎸 {t('header.synthBadge')}</>}
          {(branding?.has_logo || branding?.band_name) && (
            <div className="k-brand">
              {branding.has_logo && <img src={`/api/branding/${data.owner_id}/logo?theme=dark`} alt="" />}
              {branding.band_name && <span>{branding.band_name}</span>}
            </div>
          )}
        </div>
        <div>
          {player.audioMode
            ? <>{t('status.audioLine', { current: player.index + 1, total: player.steps.length, rate: rate.toFixed(1) })}{player.hasAudio && !audioReady && <> · {t('status.loadingAudio')}</>}</>
            : <>{t('status.legacyLine', { current: player.index + 1, total: player.steps.length, seconds: (player.msPerLine / 1000).toFixed(1) })}</>}
          {' · '}{t('status.zoom', { percent: Math.round(zoom * 100) })}
        </div>
      </div>

      <div className="k-body">
        <div className="k-lines" ref={sweepRootRef}>
          <KaraokeLines window={lineWindow}
            sweep={player.audioMode} keyPrefix={player.index} />
        </div>
        <KaraokeChordSidebar chords={uniqueChords} instruments={chordInstruments}
          songInfo={{ titulo: data.titulo, interprete: data.interprete, tom: data.tom, velocidade: data.velocidade }} />
      </div>

      {typeof timelineWindow[0]?.tEnd === 'number' && (() => {
        // buildStepWindow completa o fim da janela com passos de
        // preenchimento (fim da música) que não têm tEnd real — filtra
        // fora antes de calcular o intervalo total, senão um único NaN
        // contamina a proporção de todos os segmentos.
        const realSteps = timelineWindow.filter((s) => typeof s.tEnd === 'number')
        const start = realSteps[0].t
        const span = Math.max(0.001, realSteps[realSteps.length - 1].tEnd - start)
        return (
          <div className="k-timeline">
            {realSteps.map((step, i) => {
              const top = ((step.t - start) / span) * 100
              const height = Math.max(2, ((step.tEnd - step.t) / span) * 100)
              return (
                <div key={i} className={`k-timeline-seg${i === 0 ? ' active' : ''}`}
                  style={{ top: `${top}%`, height: `${height}%` }}>
                  {i === 0 && <div className="k-timeline-fill" />}
                </div>
              )
            })}
          </div>
        )
      })()}

      {player.audioMode ? (
        <div className="k-progress audio-mode"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            seekToFraction((e.clientX - rect.left) / rect.width)
          }}>
          <div ref={progressFillRef} />
          {audioDuration && player.samples.map((s) => (
            <div key={s.id} className="k-progress-tick"
              style={{ left: `${Math.min(100, (s.t / audioDuration) * 100)}%` }}
              title={s.nome} />
          ))}
        </div>
      ) : (
        <div className="k-progress"><div style={{ width: `${progress * 100}%` }} /></div>
      )}

      <div className="k-controls no-print">
        {inPlaylist && <>
          <button className="btn" onClick={goPrevSong} disabled={playlist.index === 0} title={t('controls.prevSong')}>⏮</button>
        </>}
        <button className="btn" onClick={restart} title={t('controls.restart')}>⟲</button>
        <button className="btn" onClick={goPrev} title={t('controls.prevLine')}>←</button>
        <button className="btn primary" onClick={togglePlay} disabled={!canPlay} title={t('controls.playPause')}>
          {countdown != null ? t('controls.skipCountdown', { count: countdown }) : player.playing ? t('controls.pause') : t('controls.play')}
        </button>
        {youtubeVideoId && (
          <button className="btn" onClick={toggleWithYoutube} disabled={!canPlay}
            title={t('controls.playWithYoutubeTitle')}>
            {player.playing ? t('controls.pauseWithYoutube') : t('controls.playWithYoutube')}
          </button>
        )}
        <button className="btn" onClick={goNext} title={t('controls.nextLine')}>→</button>
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

      {countdown != null && (
        <div className="k-countdown" onClick={skipCountdown}>
          <div key={countdown} className="k-countdown-number">{countdown}</div>
          <div className="k-countdown-label">{t('countdown.hint')}</div>
        </div>
      )}
    </div>
  )
}
