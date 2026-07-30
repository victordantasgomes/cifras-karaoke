// Motor de síntese do acompanhamento (bateria/baixo/guitarra/teclado) a
// partir da linha do tempo de acordes (utils/chordTimeline.js) e da grade
// de batidas (utils/beatGrid.js) — zero arquivos de áudio externos, mesmo
// estilo de síntese via osciladores/ruído filtrado já usado em
// utils/clickSound.js.
//
// Como toda a música (acordes + batidas) já é conhecida com antecedência —
// não é improviso ao vivo — o agendamento é feito de uma vez só, com
// tempos absolutos do AudioContext, em vez de um loop de "lookahead
// scheduler": mais simples e sem risco de deriva.

function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12)
}

/** Frequência de uma classe de altura (0-11) numa oitava (convenção MIDI: C4=60). */
function noteFreq(pitchClass, octave) {
  return midiToFreq(12 * (octave + 1) + pitchClass)
}

/** Ruído branco curto com decaimento exponencial embutido na própria onda
 * (mesma técnica de clickSound.js), passado por um filtro — base de todas
 * as percussões. */
function noiseBurst(ctx, dest, when, { duration, filterType, filterFreq, gainPeak }) {
  const n = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = filterFreq
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(gainPeak, when)
  source.connect(filter).connect(gain).connect(dest)
  source.start(when)
  return { source, gain }
}

function kick(ctx, dest, when) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, when)
  osc.frequency.exponentialRampToValueAtTime(40, when + 0.12)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(1, when)
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.25)
  osc.connect(gain).connect(dest)
  osc.start(when)
  osc.stop(when + 0.3)
  return { source: osc, gain }
}

function snare(ctx, dest, when) {
  return noiseBurst(ctx, dest, when, { duration: 0.15, filterType: 'bandpass', filterFreq: 1800, gainPeak: 0.7 })
}

function hihat(ctx, dest, when) {
  return noiseBurst(ctx, dest, when, { duration: 0.035, filterType: 'highpass', filterFreq: 7000, gainPeak: 0.3 })
}

function bassNote(ctx, dest, when, pitchClass, dur) {
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = noteFreq(pitchClass, 2)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(0.8, when + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur)
  osc.connect(gain).connect(dest)
  osc.start(when)
  osc.stop(when + dur + 0.05)
  return { source: osc, gain }
}

/** Notas do acorde com início escalonado (imita uma dedilhada/batida) e
 * decaimento curto, atrás de um filtro passa-baixa. */
function guitarStrum(ctx, dest, when, pitchClasses) {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 2200
  filter.connect(dest)
  return pitchClasses.map((pc, i) => {
    const t0 = when + i * 0.018
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = noteFreq(pc, 3)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4)
    osc.connect(gain).connect(filter)
    osc.start(t0)
    osc.stop(t0 + 0.45)
    return { source: osc, gain }
  })
}

/** Pad sustentado (ataque suave, liberação em rampa) durando o segmento do acorde. */
function keysPad(ctx, dest, when, pitchClasses, dur) {
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 3000
  filter.connect(dest)
  return pitchClasses.map((pc) => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = noteFreq(pc, 4)
    const gain = ctx.createGain()
    const sustainStart = when + Math.max(0.08, dur - 0.15)
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(0.15, when + 0.08)
    gain.gain.setValueAtTime(0.15, sustainStart)
    gain.gain.linearRampToValueAtTime(0.0001, when + dur)
    osc.connect(gain).connect(filter)
    osc.start(when)
    osc.stop(when + dur + 0.05)
    return { source: osc, gain }
  })
}

export class BandSynth {
  /**
   * @param {AudioContext} ctx
   * @param {{chordTimeline:Array, beatGrid:{t:number,isDownbeat:boolean}[], instruments:{bateria:boolean,guitarra:boolean,baixo:boolean,teclado:boolean}, duration:number}} opts
   */
  constructor(ctx, { chordTimeline, beatGrid, instruments, duration }) {
    this.ctx = ctx
    this.chordTimeline = chordTimeline
    this.beatGrid = beatGrid
    this.instruments = instruments
    this.duration = duration
    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(ctx.destination)
    this._nodes = [] // {source, gain}[] — tudo que está tocando/agendado agora
  }

  /** Cancela tudo com um fade de ~10ms (parar em pleno sustain estala). */
  cancelAll() {
    const now = this.ctx.currentTime
    for (const { source, gain } of this._nodes) {
      try {
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(0.0001, now + 0.01)
        source.stop(now + 0.012)
      } catch { /* já parado */ }
    }
    this._nodes = []
  }

  _activeChordAt(t) {
    return this.chordTimeline.find((seg) => t >= seg.start && t < seg.end) || null
  }

  /** Cancela tudo e reagenda a partir de fromTime (tempo-música, segundos),
   * na velocidade `rate`, começando no instante real `when` do AudioContext. */
  scheduleFrom(fromTime, rate = 1, when = this.ctx.currentTime) {
    this.cancelAll()
    const at = (musicTime) => when + (musicTime - fromTime) / rate
    if (this.instruments.bateria) this._scheduleDrums(fromTime, at)
    if (this.instruments.baixo) this._scheduleBass(fromTime, at)
    if (this.instruments.guitarra) this._scheduleGuitar(fromTime, at)
    if (this.instruments.teclado) this._scheduleKeys(fromTime, at)
  }

  _scheduleDrums(fromTime, at) {
    this.beatGrid.forEach((b, i) => {
      if (b.t < fromTime) return
      const w = at(b.t)
      if (i % 4 === 0 || i % 4 === 2) this._nodes.push(kick(this.ctx, this.master, w))
      if (i % 4 === 1 || i % 4 === 3) this._nodes.push(snare(this.ctx, this.master, w))
      this._nodes.push(hihat(this.ctx, this.master, w))
    })
  }

  _scheduleBass(fromTime, at) {
    const beatDur = this.beatGrid.length > 1 ? this.beatGrid[1].t - this.beatGrid[0].t : 0.5
    this.beatGrid.forEach((b) => {
      if (b.t < fromTime) return
      const chord = this._activeChordAt(b.t)
      if (!chord) return
      const dur = Math.max(0.05, Math.min(beatDur * 0.9, chord.end - b.t))
      this._nodes.push(bassNote(this.ctx, this.master, at(b.t), chord.root, dur))
    })
  }

  _scheduleGuitar(fromTime, at) {
    this.beatGrid.forEach((b, i) => {
      if (b.t < fromTime || i % 2 !== 0) return // batida a cada 2 tempos
      const chord = this._activeChordAt(b.t)
      if (!chord) return
      const pcs = chord.intervals.map((iv) => (chord.root + iv) % 12)
      this._nodes.push(...guitarStrum(this.ctx, this.master, at(b.t), pcs))
    })
  }

  _scheduleKeys(fromTime, at) {
    for (const seg of this.chordTimeline) {
      if (seg.end <= fromTime) continue
      const start = Math.max(seg.start, fromTime)
      const pcs = seg.intervals.map((iv) => (seg.root + iv) % 12)
      this._nodes.push(...keysPad(this.ctx, this.master, at(start), pcs, seg.end - start))
    }
  }
}
