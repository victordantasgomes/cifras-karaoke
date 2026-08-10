import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import { detectPitch, noteToFreq, PitchStabilizer } from '../utils/pitchDetect'
import { INSTRUMENTS } from '../utils/tunings'

const DEFAULT_A4 = 440
const MIN_A4 = 415
const MAX_A4 = 466
const IN_TUNE_CENTS = 5
const FFT_SIZE = 2048
const ANALYSIS_INTERVAL_MS = 90 // throttla a análise (reduz CPU e ruído entre quadros — a estabilização mora em PitchStabilizer)

export default function Tuner() {
  const { t } = useTranslation('tuner')
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

  const [a4, setA4] = useState(DEFAULT_A4)
  const [instrumentId, setInstrumentId] = useState('guitar')
  const [tuningId, setTuningId] = useState('standard')
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)
  const [reading, setReading] = useState(null)

  const instrument = INSTRUMENTS.find((i) => i.id === instrumentId) || INSTRUMENTS[0]
  const tuning = instrument.tunings.find((tu) => tu.id === tuningId) || instrument.tunings[0]
  const strings = useMemo(
    () => (tuning.strings ? tuning.strings.map((str) => ({ ...str, freq: noteToFreq(str.note, str.octave, a4) })) : null),
    [tuning, a4],
  )

  const a4Ref = useRef(a4)
  a4Ref.current = a4
  const stringsRef = useRef(strings)
  stringsRef.current = strings
  const stabilizerRef = useRef(new PitchStabilizer())

  useEffect(() => { stabilizerRef.current.reset(); setReading(null) }, [instrumentId, tuningId])

  function changeInstrument(nextId) {
    const next = INSTRUMENTS.find((i) => i.id === nextId)
    setInstrumentId(nextId)
    setTuningId(next.tunings[0].id)
  }

  const appliedSavedA4 = useRef(false)
  useEffect(() => {
    if (appliedSavedA4.current) return
    const saved = settings?.prefs?.tunerA4
    if (saved) setA4(saved)
    if (settings) appliedSavedA4.current = true
  }, [settings])

  const saveA4 = useMutation({
    mutationFn: (value) => api.put('/settings', {
      prefs: { ...qc.getQueryData(['settings'])?.prefs, tunerA4: value },
    }).then((r) => r.data),
    onSuccess: (d) => qc.setQueryData(['settings'], d),
  })

  const audioCtxRef = useRef(null)
  const streamRef = useRef(null)
  const analyserRef = useRef(null)
  const intervalRef = useRef(null)
  const bufferRef = useRef(new Float32Array(FFT_SIZE))

  // setInterval em vez de requestAnimationFrame de propósito: rAF é
  // pausado pelo navegador quando a aba perde o foco/visibilidade (troca
  // de aba, minimizar) — um afinador que trava nessa hora é pior que um
  // metrônomo que trava, já que quem está afinando costuma olhar pra
  // outro app (ex.: um afinador de referência) enquanto ajusta a corda.
  function tick() {
    const analyser = analyserRef.current
    if (!analyser) return
    analyser.getFloatTimeDomainData(bufferRef.current)
    const freq = detectPitch(bufferRef.current, audioCtxRef.current.sampleRate)
    setReading(stabilizerRef.current.push(freq, stringsRef.current, a4Ref.current))
  }

  async function start() {
    setError(null)
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextCtor) {
      setError('genericError')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContextCtor()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      source.connect(analyser)
      analyserRef.current = analyser
      stabilizerRef.current.reset()
      setListening(true)
      intervalRef.current = setInterval(tick, ANALYSIS_INTERVAL_MS)
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'permissionDenied'
        : err.name === 'NotFoundError' ? 'noDevice' : 'genericError')
    }
  }

  function stop() {
    clearInterval(intervalRef.current)
    intervalRef.current = null
    analyserRef.current = null
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null }
    setListening(false)
    setReading(null)
    stabilizerRef.current.reset()
  }

  useEffect(() => () => stop(), [])

  function changeA4(next) {
    const value = Math.min(MAX_A4, Math.max(MIN_A4, Math.round(next)))
    setA4(value)
    if (token) saveA4.mutate(value)
  }

  const cents = reading?.cents ?? 0
  const inTune = reading && Math.abs(cents) <= IN_TUNE_CENTS
  const clampedCents = Math.max(-50, Math.min(50, cents))
  const statusLabel = !reading ? t('waitingSignal') : inTune ? t('inTune') : cents < 0 ? t('tooLow') : t('tooHigh')
  const statusColor = !reading ? 'var(--muted)' : inTune ? 'var(--ok, #46c48a)' : 'var(--accent)'
  const activeStringFreq = reading?.targetFreq ?? null

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <div className="page-sub">{t('subtitle')}</div>

      <div className="card" style={{ maxWidth: 460 }}>
        <div className="row" style={{ gap: 10, marginBottom: 14 }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>{t('instrument')}</label>
            <select className="input" value={instrumentId} onChange={(e) => changeInstrument(e.target.value)}>
              {INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{t(i.labelKey)}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>{t('tuning')}</label>
            <select className="input" value={tuningId} onChange={(e) => setTuningId(e.target.value)}>
              {instrument.tunings.map((tu) => <option key={tu.id} value={tu.id}>{t(tu.labelKey)}</option>)}
            </select>
          </div>
        </div>

        {strings && (
          <div className="row" style={{ gap: 6, marginBottom: 16, justifyContent: 'center' }}>
            {strings.map((str) => {
              const active = activeStringFreq != null && Math.abs(str.freq - activeStringFreq) < 0.01
              return (
                <span key={`${str.note}${str.octave}`} className="chip" style={active ? {
                  background: 'var(--accent)', color: 'var(--accent-ink)',
                } : undefined}>
                  {str.note}{str.octave}
                </span>
              )
            })}
          </div>
        )}

        {error ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--danger, #ef5a5f)', marginBottom: 14 }}>{t(error)}</p>
            <button className="btn primary" onClick={start}>{t('retry')}</button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 72, fontWeight: 700, lineHeight: 1,
                color: reading ? 'var(--text)' : 'var(--muted)',
              }}>
                {reading ? reading.note : '—'}
                {reading && <span style={{ fontSize: 28, color: 'var(--muted)' }}>{reading.octave}</span>}
              </div>
              <div style={{ color: statusColor, fontWeight: 600, marginTop: 6 }}>{statusLabel}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 2 }}>
                {reading?.targetFreq ? `${reading.targetFreq.toFixed(1)} Hz` : ' '}
              </div>
            </div>

            <div style={{ position: 'relative', height: 28, marginBottom: 18 }}>
              <div style={{
                position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--stroke)',
              }} />
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 12, height: 4, borderRadius: 2, background: 'var(--glass-strong)',
              }} />
              <div style={{
                position: 'absolute', top: 2, width: 4, height: 24, borderRadius: 2,
                left: `calc(${50 + clampedCents}% - 2px)`,
                background: statusColor, transition: 'left 80ms linear',
              }} />
            </div>

            <div className="field">
              <label>{t('a4Label')}</label>
              <div className="row" style={{ gap: 10 }}>
                <input
                  type="range" min={MIN_A4} max={MAX_A4} value={a4}
                  onChange={(e) => changeA4(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }}
                />
                <span style={{ minWidth: 44, textAlign: 'right', color: 'var(--muted)' }}>{a4} Hz</span>
              </div>
            </div>

            <button className="btn primary" style={{ width: '100%' }} onClick={listening ? stop : start}>
              {listening ? t('stop') : t('start')}
            </button>
          </>
        )}
      </div>
    </>
  )
}
