import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { playClick } from '../utils/clickSound'
import { IconPlay, IconPause } from '../components/icons'

const MIN_BPM = 30
const MAX_BPM = 300
const DEFAULT_BPM = 100
const BAR_OPTIONS = [2, 3, 4, 5, 6]

// scheduler de "lookahead": em vez de setInterval(callback, 60000/bpm) (que
// arrasta com o tempo por causa do jitter do event loop), agenda cada
// batida contra o relógio do AudioContext, olhando um pouco à frente —
// mesma técnica clássica de metrônomo em Web Audio, precisão de sample.
const LOOKAHEAD_MS = 25
const SCHEDULE_AHEAD_SEC = 0.1
const TAP_WINDOW_MS = 3000

export default function Metronome() {
  const { t } = useTranslation('metronome')
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    enabled: Boolean(token),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const [bpm, setBpm] = useState(DEFAULT_BPM)
  const [beatsPerBar, setBeatsPerBar] = useState(4)
  const [running, setRunning] = useState(false)
  const [activeBeat, setActiveBeat] = useState(-1)
  const [tapTimes, setTapTimes] = useState([])

  const bpmRef = useRef(bpm)
  bpmRef.current = bpm
  const beatsPerBarRef = useRef(beatsPerBar)
  beatsPerBarRef.current = beatsPerBar

  const audioCtxRef = useRef(null)
  const nextBeatTimeRef = useRef(0)
  const beatCounterRef = useRef(0)
  const schedulerTimerRef = useRef(null)
  const highlightTimersRef = useRef([])

  const appliedSavedBpm = useRef(false)
  useEffect(() => {
    if (appliedSavedBpm.current) return
    const saved = settings?.prefs?.metronomeBpm
    if (saved) setBpm(saved)
    if (settings) appliedSavedBpm.current = true
  }, [settings])

  const saveBpm = useMutation({
    mutationFn: (value) => api.put('/settings', {
      prefs: { ...qc.getQueryData(['settings'])?.prefs, metronomeBpm: value },
    }).then((r) => r.data),
    onSuccess: (d) => qc.setQueryData(['settings'], d),
  })

  function clearHighlightTimers() {
    highlightTimersRef.current.forEach(clearTimeout)
    highlightTimersRef.current = []
  }

  function scheduler() {
    const ctx = audioCtxRef.current
    while (nextBeatTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_SEC) {
      const beatInBar = beatCounterRef.current % beatsPerBarRef.current
      const delayMs = Math.max(0, (nextBeatTimeRef.current - ctx.currentTime) * 1000)
      const timer = setTimeout(() => { playClick(); setActiveBeat(beatInBar) }, delayMs)
      highlightTimersRef.current.push(timer)
      nextBeatTimeRef.current += 60 / bpmRef.current
      beatCounterRef.current += 1
    }
  }

  function start() {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!AudioContextCtor) return
    audioCtxRef.current = new AudioContextCtor()
    beatCounterRef.current = 0
    nextBeatTimeRef.current = audioCtxRef.current.currentTime + 0.05
    setRunning(true)
    scheduler()
    schedulerTimerRef.current = setInterval(scheduler, LOOKAHEAD_MS)
  }

  function stop() {
    clearInterval(schedulerTimerRef.current)
    schedulerTimerRef.current = null
    clearHighlightTimers()
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    setRunning(false)
    setActiveBeat(-1)
    if (token && bpm !== settings?.prefs?.metronomeBpm) saveBpm.mutate(bpm)
  }

  useEffect(() => () => { clearInterval(schedulerTimerRef.current); clearHighlightTimers() }, [])

  function toggle() { running ? stop() : start() }

  function changeBpm(next) {
    setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(next))))
  }

  function tapTempo() {
    const now = performance.now()
    const recent = [...tapTimes, now].filter((ms) => now - ms < TAP_WINDOW_MS)
    setTapTimes(recent)
    if (recent.length >= 2) {
      const intervals = recent.slice(1).map((ms, i) => ms - recent[i])
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
      changeBpm(60000 / avgMs)
    }
  }

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>

      <div className="card" style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'center', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
            {bpm}
          </span>
          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{t('bpm')}</span>
        </div>

        <input
          type="range" min={MIN_BPM} max={MAX_BPM} value={bpm}
          onChange={(e) => changeBpm(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent)' }}
        />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '14px 0 18px' }}>
          {Array.from({ length: beatsPerBar }, (_, i) => (
            <span key={i} style={{
              width: i === 0 ? 16 : 12, height: i === 0 ? 16 : 12, borderRadius: '50%',
              background: activeBeat === i ? 'var(--accent)' : 'var(--glass-strong)',
              border: '1px solid var(--stroke)',
              transition: 'background 60ms',
            }} />
          ))}
        </div>

        <div className="field">
          <label>{t('beatsPerBar')}</label>
          <select className="input" value={beatsPerBar} onChange={(e) => setBeatsPerBar(Number(e.target.value))}>
            {BAR_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary" style={{ flex: 1 }} onClick={toggle}>
            {running ? <IconPause /> : <IconPlay />} {running ? t('stop') : t('start')}
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={tapTempo}>{t('tapTempo')}</button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>
          {t('tapHint')}
        </p>
        {token && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4, textAlign: 'center' }}>{t('savedHint')}</p>}
      </div>
    </>
  )
}
