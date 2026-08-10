import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { resolveTimeline } from '../utils/timeline'
import { parseBody } from '../utils/lineClassifier'
import { slugify } from '../utils/slug'
import { decodePeaks } from '../utils/waveform'
import { groupIntoSteps, buildStepWindow, stepRawIndex } from '../utils/steps'
import { useAudioSync } from '../hooks/useAudioSync'
import { useHotkeys } from '../hooks/useHotkeys'
import KaraokeLines from './KaraokeLines'

const PREVIEW_ROW_BUDGET = 5
const TIME_MARK_RE = /^\[t=(\d+(?:\.\d+)?)\]\s*/
const BLOCK_ICON = { solo: '🎸', riff: '🎵', tab: '🎼' }
const PLAYBACK_RATES = [0.5, 0.75, 1]

function formatTime(s) {
  if (s == null || Number.isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Texto curto pra identificar um passo em tooltips (banda/marcador da
 * waveform) — substitui o antigo "linha N", que não dizia nada sobre o
 * conteúdo. */
function describeStep(step, t) {
  if (!step) return ''
  if (step.kind === 'pair') {
    const c = step.chord.text.trim()
    const l = step.lyric.text.trim()
    return c && l ? `${c} — ${l}` : (l || c)
  }
  if (step.kind === 'block') {
    const first = step.lines[0].text.trim()
    return `${first || t('blockFallback')} (${step.lines[0].tipo}, ${t('lines', { count: step.lines.length })})`
  }
  const { line } = step
  if (line.tipo === 'secao') return `[${line.text}]`
  return line.text.trim() || t('blankLine')
}

function timeChip(t) {
  return <span className={`sync-step-chip${t != null ? ' marked' : ''}`}>{t != null ? formatTime(t) : '—'}</span>
}

/**
 * Workspace de sincronização estilo CDG dentro do editor: forma de onda real
 * (decodificada no navegador via Web Audio API) com marcadores arrastáveis,
 * transporte de reprodução (tocar/pausar/parar/velocidade/zoom), e uma lista
 * de PASSOS de reprodução (mesmo agrupamento acorde+letra/bloco/seção do
 * palco de karaokê, ver utils/steps.js) pra marcar o tempo de cada trecho —
 * em vez de navegar linha física crua por linha física crua, o que exigia
 * passar por linhas em branco e tags que o parser descarta se marcadas.
 * `markLineTime` (de `SongEditor.jsx`) já cuida de escrever `[t=SEG]` no
 * corpo e empilhar no histórico de desfazer/refazer — este componente só
 * decide QUAL linha física e QUAL tempo.
 */
export default function SyncWorkspace({ body, markLineTime, trackBlob, trackUrl, audioRef, samplesMeta }) {
  const { t } = useTranslation('syncWorkspace')
  const [peaks, setPeaks] = useState(null)
  const [duration, setDuration] = useState(null)
  const [decoding, setDecoding] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [expandedBlocks, setExpandedBlocks] = useState(() => new Set())
  const waveScrollRef = useRef(null)
  const waveWrapRef = useRef(null)
  const canvasRef = useRef(null)
  const playheadRef = useRef(null)
  const sweepRootRef = useRef(null)
  const progressFillRef = useRef(null)
  const timeLabelRef = useRef(null)
  const noSampleRefs = useRef({})
  const rowRefs = useRef([])

  // espelha play/pause/ended do <audio> real (montado no card "Faixa de
  // referência", acima) — mesmo elemento, controlado tanto pelos controles
  // nativos dele quanto pelos botões de transporte daqui.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onPause)
    setPlaying(!audio.paused)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onPause)
    }
  }, [audioRef, trackUrl])

  // reaplica a velocidade escolhida sempre que o elemento troca de faixa
  // (o navegador preserva playbackRate entre trocas de src na prática, mas
  // não custa garantir) ou quando o usuário muda o seletor.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate
  }, [audioRef, trackUrl, playbackRate])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play()
    else audio.pause()
  }

  const stopAudio = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
  }

  // decodifica a waveform sempre que a faixa muda (upload novo, ou troca de música)
  useEffect(() => {
    let cancelled = false
    setPeaks(null)
    setDuration(null)
    if (!trackBlob) return undefined
    setDecoding(true)
    decodePeaks(trackBlob)
      .then(({ peaks: p, duration: d }) => { if (!cancelled) { setPeaks(p); setDuration(d) } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDecoding(false) })
    return () => { cancelled = true }
  }, [trackBlob])

  // linhas cruas — mesma indexação usada por markLineTime (body.split('\n'))
  const rawLines = useMemo(() => body.split('\n'), [body])

  // marcadores já existentes, extraídos das linhas cruas (pra desenhar/arrastar na waveform)
  const rawMarks = useMemo(() => {
    const marks = []
    rawLines.forEach((l, i) => {
      const m = l.match(TIME_MARK_RE)
      if (m) marks.push({ lineIndex: i, t: parseFloat(m[1]), text: l.replace(TIME_MARK_RE, '') })
    })
    return marks
  }, [rawLines])

  // faixas sombreadas entre marcações consecutivas — mostram visualmente
  // QUAL trecho de áudio pertence a cada linha (não só onde ela começa),
  // pra facilitar enxergar o intervalo de tempo que cada uma ocupa.
  const bands = useMemo(() => {
    if (duration == null) return []
    const sorted = [...rawMarks].sort((a, b) => a.t - b.t)
    const points = [0, ...sorted.map((m) => m.t), duration]
    return points.slice(0, -1).map((start, i) => ({
      start,
      end: points[i + 1],
      markLineIndex: i === 0 ? -1 : sorted[i - 1].lineIndex,
    }))
  }, [rawMarks, duration])

  // TODOS os passos do arquivo (não filtrados por visibilidade) — a lista
  // de marcação abaixo espelha a música inteira, igual a lista de linhas
  // cruas fazia antes, só que agrupada por passo de reprodução em vez de
  // linha física.
  const allSteps = useMemo(() => groupIntoSteps(parseBody(body)), [body])

  // mapa canônico linha-física -> índice em allSteps. Único mecanismo usado
  // pra ir de um índice de linha crua (banda/marcador da waveform, ou o
  // passo ativo do preview filtrado) até a linha certa da lista — nunca
  // tentar casar allSteps com resolvedSteps por posição/formato, os dois
  // podem agrupar diferente ao redor de conteúdo oculto (ver plano).
  const rawToStepIndex = useMemo(() => {
    const m = new Map()
    allSteps.forEach((step, i) => {
      if (step.kind === 'pair') { m.set(step.chord.raw, i); m.set(step.lyric.raw, i) }
      else if (step.kind === 'block') step.lines.forEach((l) => m.set(l.raw, i))
      else m.set(step.line.raw, i)
    })
    return m
  }, [allSteps])

  useEffect(() => { setStepIndex((i) => Math.min(i, Math.max(0, allSteps.length - 1))) }, [allSteps.length])

  const selectedRaw = allSteps[stepIndex] ? stepRawIndex(allSteps[stepIndex]) : -1

  // a faixa "dona" do passo selecionado: a última cuja marca começa em ou
  // antes da linha crua alvo do passo selecionado (as faixas são
  // cronológicas, então a busca é linear)
  const activeBandIdx = useMemo(() => {
    let best = -1
    bands.forEach((b, i) => { if (b.markLineIndex !== -1 && b.markLineIndex <= selectedRaw) best = i })
    return best
  }, [bands, selectedRaw])

  // linhas tipadas, FILTRADAS por visibilidade, agrupadas em passos e com
  // tempo resolvido — igual ao que o palco monta a partir do payload do
  // backend (ver karaoke_service.py::payload). Usado pela pré-visualização
  // de varredura E pelo realce "ao vivo" da lista de marcação.
  const { resolvedSteps, sampleTicks } = useMemo(() => {
    if (duration == null) return { resolvedSteps: [], sampleTicks: [] }
    const entries = parseBody(body)
    const visible = entries.filter((e) => e.visivel)
    const steps = groupIntoSteps(visible)
    const resolved = resolveTimeline(steps, duration, 2500)
    const ticks = []
    entries.forEach((e) => {
      if (e.tipo !== 'sample' || e.t == null || !e.visivel) return
      const id = slugify(e.text.trim())
      if (samplesMeta && samplesMeta[id]) ticks.push({ t: e.t, nome: samplesMeta[id].nome })
    })
    return { resolvedSteps: resolved, sampleTicks: ticks }
  }, [body, duration, samplesMeta])

  useAudioSync({
    audioRef, resolvedLines: resolvedSteps, samples: [], sampleAudioRefs: noSampleRefs,
    sweepRootRef, progressFillRef, audioDuration: duration, onIndexChange: setPreviewIndex,
  })

  // índice em allSteps do passo que está tocando agora — traduz o
  // previewIndex (índice em resolvedSteps, filtrado) via o mapa canônico,
  // já que toda entrada visível aparece em algum passo de allSteps.
  const activeAllStepsIdx = useMemo(() => {
    const activeStep = resolvedSteps[previewIndex]
    if (!activeStep) return -1
    return rawToStepIndex.get(stepRawIndex(activeStep)) ?? -1
  }, [resolvedSteps, previewIndex, rawToStepIndex])

  // mantém a linha ativa visível na lista de marcação durante a reprodução
  useEffect(() => {
    if (activeAllStepsIdx < 0) return
    rowRefs.current[activeAllStepsIdx]?.scrollIntoView({ block: 'nearest' })
  }, [activeAllStepsIdx])

  // playhead + rótulo de tempo da waveform — loop próprio e simples (só
  // move um elemento, não precisa do motor completo do useAudioSync) — e,
  // com zoom ativo, mantém o playhead centralizado no trecho visível.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || duration == null) return undefined
    let raf
    const tick = () => {
      const el = playheadRef.current
      if (el) el.style.left = `${Math.min(100, Math.max(0, (audio.currentTime / duration) * 100))}%`
      const label = timeLabelRef.current
      if (label) label.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`
      const scrollEl = waveScrollRef.current
      if (scrollEl && zoom > 1 && waveWrapRef.current && !audio.paused) {
        const px = (audio.currentTime / duration) * waveWrapRef.current.clientWidth
        scrollEl.scrollLeft = Math.max(0, px - scrollEl.clientWidth / 2)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [audioRef, duration, zoom])

  // desenha as barras da waveform (estático — só quando os picos, o zoom ou
  // o tamanho do contêiner mudam, não a cada frame). Redesenha diretamente
  // quando `zoom` muda (dependência do efeito) em vez de confiar só no
  // ResizeObserver — o zoom troca a largura do wrap via CSS, e um
  // ResizeObserver eventualmente pegaria isso sozinho, mas redesenhar de
  // uma vez no próprio efeito é mais direto e não depende de timing do
  // navegador. O ResizeObserver continua útil pra outras causas de resize
  // (redimensionar a janela, colapsar a barra lateral, etc.).
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = waveWrapRef.current
    if (!canvas || !wrap || !peaks) return undefined
    const draw = () => {
      const width = wrap.clientWidth
      const height = wrap.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const c = canvas.getContext('2d')
      c.setTransform(dpr, 0, 0, dpr, 0, 0)
      c.clearRect(0, 0, width, height)
      c.fillStyle = 'rgba(255,255,255,0.35)'
      const mid = height / 2
      const barWidth = width / peaks.length
      for (let i = 0; i < peaks.length; i++) {
        const amp = peaks[i] * mid
        c.fillRect(i * barWidth, mid - amp, Math.max(1, barWidth - 1), Math.max(1, amp * 2))
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [peaks, zoom])

  const selectStep = (i) => {
    setStepIndex(i)
    const step = allSteps[i]
    if (step && step.t != null && audioRef.current) audioRef.current.currentTime = step.t
  }

  const mark = () => {
    if (!audioRef.current || !allSteps.length) return
    markLineTime(stepRawIndex(allSteps[stepIndex]), audioRef.current.currentTime)
    setStepIndex((i) => Math.min(i + 1, allSteps.length - 1))
  }

  useHotkeys({ Space: mark }, [stepIndex, allSteps, markLineTime])

  const seekFromClientX = (clientX) => {
    if (!waveWrapRef.current || duration == null || !audioRef.current) return
    const rect = waveWrapRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    audioRef.current.currentTime = frac * duration
  }

  const startDrag = (lineIndex) => (e) => {
    e.stopPropagation()
    e.preventDefault()
    const rect = waveWrapRef.current.getBoundingClientRect()
    const onMove = (ev) => {
      const frac = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
      markLineTime(lineIndex, frac * duration)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!trackUrl) {
    return <div className="page-sub">{t('uploadHint')}</div>
  }

  const previewWindow = buildStepWindow(resolvedSteps, previewIndex, PREVIEW_ROW_BUDGET)
  const markableSteps = allSteps.filter((s) => !(s.kind === 'single' && s.line.tipo === 'observacao' && !s.line.visivel))
  const markedCount = markableSteps.length - markableSteps.filter((s) => s.t == null).length

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{t('title')}</h3>
        <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
          {t('hint.clickStep')} ·{' '}
          {t('hint.dragMarker')} ·{' '}
          <Trans i18nKey="syncWorkspace:hint.spaceMark" components={{ strong: <strong /> }} />
        </span>
      </div>

      {decoding && <div className="empty" style={{ padding: '24px 0' }}>{t('generatingWaveform')}</div>}

      {peaks && duration != null && (
        <>
          <div className="row" style={{ marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={togglePlay}>
              {playing ? t('pause') : t('play')}
            </button>
            <button type="button" className="btn" onClick={stopAudio}>{t('stop')}</button>
            <span ref={timeLabelRef} style={{ color: 'var(--muted)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
              {formatTime(0)} / {formatTime(duration)}
            </span>
            <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--stroke)' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{t('speed')}</span>
            {PLAYBACK_RATES.map((r) => (
              <button key={r} type="button" className={`btn ${playbackRate === r ? 'primary' : 'ghost'}`}
                onClick={() => setPlaybackRate(r)}>{r}x</button>
            ))}
            <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--stroke)' }} />
            <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{t('zoom')}</span>
            <input type="range" min="1" max="6" step="0.5" value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 110 }} />
            <span style={{ color: 'var(--muted)', fontSize: 12.5, minWidth: 26 }}>{zoom}x</span>
          </div>

          <div ref={waveScrollRef} className="sync-wave-scroll" style={{ marginBottom: 14 }}>
            <div ref={waveWrapRef} onClick={(e) => seekFromClientX(e.clientX)}
              style={{
                position: 'relative', height: 120, width: `${zoom * 100}%`, minWidth: '100%',
                background: 'rgba(0,0,0,0.35)', cursor: 'pointer', overflow: 'hidden',
              }}>
              <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
              {bands.map((b, i) => (
                <div key={i} title={b.markLineIndex === -1 ? undefined : describeStep(allSteps[rawToStepIndex.get(b.markLineIndex)], t)}
                  style={{
                    position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none',
                    left: `${(b.start / duration) * 100}%`,
                    width: `${((b.end - b.start) / duration) * 100}%`,
                    background: i === activeBandIdx ? 'var(--amber-soft)' : 'rgba(255,255,255,0.045)',
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                  }} />
              ))}
              {sampleTicks.map((s, i) => (
                <div key={i} title={s.nome}
                  style={{
                    position: 'absolute', top: 0, width: 2, height: 12,
                    background: 'var(--sample)', left: `${Math.min(100, (s.t / duration) * 100)}%`,
                  }} />
              ))}
              {rawMarks.map(({ lineIndex, t, text }) => (
                <div key={lineIndex} onMouseDown={startDrag(lineIndex)}
                  onClick={(e) => { e.stopPropagation(); const idx = rawToStepIndex.get(lineIndex); if (idx != null) setStepIndex(idx) }}
                  title={describeStep(allSteps[rawToStepIndex.get(lineIndex)], t) || text.trim() || t('lineFallback', { number: lineIndex + 1 })}
                  style={{
                    position: 'absolute', top: 0, bottom: 0, width: 2, cursor: 'ew-resize',
                    left: `${Math.min(100, (t / duration) * 100)}%`,
                    background: lineIndex === selectedRaw ? 'var(--amber)' : 'rgba(255,255,255,0.55)',
                  }}>
                  <div style={{
                    position: 'absolute', top: -7, left: -5, width: 0, height: 0,
                    borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                    borderTop: `7px solid ${lineIndex === selectedRaw ? 'var(--amber)' : 'rgba(255,255,255,0.55)'}`,
                  }} />
                </div>
              ))}
              <div ref={playheadRef}
                style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: '#fff', left: '0%', pointerEvents: 'none' }} />
            </div>
          </div>

          <details open style={{ marginBottom: 14 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 12.5, marginBottom: 8 }}>
              {t('stagePreview')}
            </summary>
            <div ref={sweepRootRef} style={{ background: '#000', borderRadius: 8, padding: '10px 18px', overflow: 'hidden', marginTop: 8 }}>
              <KaraokeLines window={previewWindow} sweep keyPrefix={previewIndex} />
            </div>
          </details>
        </>
      )}

      <div className="row" style={{ marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" onClick={mark}>
          {t('markStep')} {allSteps.length ? stepIndex + 1 : 0}/{allSteps.length}
        </button>
        <button type="button" className="btn" onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>{t('previous')}</button>
        <button type="button" className="btn" onClick={() => setStepIndex((i) => Math.min(allSteps.length - 1, i + 1))}>{t('next')}</button>
        <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
          {t('markedCount', { marked: markedCount, total: markableSteps.length })}
        </span>
      </div>

      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {allSteps.map((step, i) => {
          const selected = i === stepIndex
          const active = i === activeAllStepsIdx
          const setRowRef = (el) => { rowRefs.current[i] = el }
          const onSelect = () => selectStep(i)
          if (step.kind === 'block') {
            return (
              <BlockStepRow key={i} step={step} selected={selected} active={active}
                expanded={expandedBlocks.has(i)}
                onToggleExpand={() => setExpandedBlocks((s) => {
                  const next = new Set(s)
                  if (next.has(i)) next.delete(i); else next.add(i)
                  return next
                })}
                onSelect={onSelect} markLineTime={markLineTime} audioRef={audioRef} rowRef={setRowRef} />
            )
          }
          return <StepRow key={i} step={step} selected={selected} active={active} onSelect={onSelect} rowRef={setRowRef} />
        })}
      </div>
    </div>
  )
}

function StepRow({ step, selected, active, onSelect, rowRef }) {
  const { t } = useTranslation('syncWorkspace')
  const classes = (extra) => `sync-step ${extra}${selected ? ' selected' : ''}${active ? ' live' : ''}`
  const chip = timeChip(step.t)

  if (step.kind === 'pair') {
    return (
      <div ref={rowRef} onClick={onSelect} className={classes('pair')}>
        <div className="sync-step-body">
          <div className="sync-step-chord">{step.chord.text.trim() || ' '}</div>
          <div className="sync-step-lyric">{step.lyric.text.trim() || ' '}</div>
        </div>
        {chip}
      </div>
    )
  }

  const { line } = step

  if (line.tipo === 'secao') {
    return (
      <div ref={rowRef} onClick={onSelect} className={classes('secao')}>
        <span>{line.text}</span>{chip}
      </div>
    )
  }
  if (line.tipo === 'observacao') {
    const oculta = !line.visivel
    return (
      <div ref={rowRef} onClick={oculta ? undefined : onSelect} className={classes(`observacao${oculta ? ' oculta' : ''}`)}>
        <span>💬 {line.text}</span>
        {oculta ? <span className="sync-step-chip">{t('notMarked')}</span> : chip}
      </div>
    )
  }
  if (line.tipo === 'sample') {
    return (
      <div ref={rowRef} onClick={onSelect} className={classes('sample')}>
        <span>🔊 {line.text}</span>{chip}
      </div>
    )
  }
  if (line.tipo === 'acorde') {
    return (
      <div ref={rowRef} onClick={onSelect} className={classes('acorde')}>
        <span className="sync-step-chord">{line.text.trim()}</span>{chip}
      </div>
    )
  }
  if (!line.text.trim()) {
    return (
      <div ref={rowRef} onClick={onSelect} className={classes('pause')}>
        <span>{t('pauseMarker')}</span>{chip}
      </div>
    )
  }
  return (
    <div ref={rowRef} onClick={onSelect} className={classes('letra')}>
      <span className="sync-step-lyric">{line.text}</span>{chip}
    </div>
  )
}

function BlockStepRow({ step, selected, active, expanded, onToggleExpand, onSelect, markLineTime, audioRef, rowRef }) {
  const { t } = useTranslation('syncWorkspace')
  const first = step.lines[0]
  const icon = BLOCK_ICON[first.tipo] || '🎼'
  return (
    <div ref={rowRef} className={`sync-step block${selected ? ' selected' : ''}${active ? ' live' : ''}`}>
      <div className="sync-step-block-header" onClick={onSelect}>
        <button type="button" className="sync-step-expand" onClick={(e) => { e.stopPropagation(); onToggleExpand() }}>
          {expanded ? '▾' : '▸'}
        </button>
        <span>{icon} {first.tipo} — {t('lines', { count: step.lines.length })}</span>
        {timeChip(step.t)}
      </div>
      {expanded && (
        <div className="sync-step-block-lines">
          {step.lines.map((l, i) => (
            <div key={i} className="sync-step-block-line">
              <span>{l.text || ' '}</span>
              {timeChip(l.t)}
              <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 11.5 }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (audioRef.current) markLineTime(l.raw, audioRef.current.currentTime)
                }}>⏱</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
