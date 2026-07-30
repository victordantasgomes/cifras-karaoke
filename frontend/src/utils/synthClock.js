// Relógio sintético: imita só a parte da interface de <audio> que
// `hooks/useAudioSync.js` e `pages/KaraokePlayer.jsx` realmente usam
// (`currentTime` get/set, `paused`, `playbackRate` get/set, `play()`,
// `pause()`, e os eventos 'play'/'seeked') — o suficiente pra um
// `BandSynth` (utils/bandSynth.js) substituir o elemento <audio> real como
// motor de sincronismo do palco, sem precisar mudar uma linha do motor de
// sincronismo já existente (que nunca faz `instanceof HTMLAudioElement`).
export class SynthClock extends EventTarget {
  constructor(ctx, bandSynth, { duration }) {
    super()
    this.ctx = ctx
    this.bandSynth = bandSynth
    this.duration = duration
    this._paused = true
    this._rate = 1
    this._pausedAt = 0 // tempo-música (s) onde ficamos parados
    this._startCtxTime = 0 // ctx.currentTime de quando o play() atual começou
    this._endTimer = null
  }

  get paused() { return this._paused }

  get currentTime() {
    if (this._paused) return this._pausedAt
    return Math.min(this.duration, this._pausedAt + (this.ctx.currentTime - this._startCtxTime) * this._rate)
  }

  set currentTime(t) {
    this._pausedAt = Math.max(0, Math.min(t, this.duration))
    this._startCtxTime = this.ctx.currentTime
    if (!this._paused) {
      this.bandSynth.scheduleFrom(this._pausedAt, this._rate)
      this._armEndTimer()
    }
    this.dispatchEvent(new Event('seeked'))
  }

  get playbackRate() { return this._rate }

  set playbackRate(r) {
    const now = this.currentTime
    this._rate = r
    this._pausedAt = now
    this._startCtxTime = this.ctx.currentTime
    if (!this._paused) {
      this.bandSynth.scheduleFrom(now, r)
      this._armEndTimer()
    }
  }

  /** Retorna uma Promise (mesma interface de HTMLMediaElement.play()) — o
   * ctx.resume() só resolve como resultado direto do gesto do usuário que
   * chamou play(), satisfazendo a política de autoplay do navegador. */
  play() {
    if (!this._paused) return Promise.resolve()
    return this.ctx.resume().then(() => {
      this._paused = false
      this._startCtxTime = this.ctx.currentTime
      this.bandSynth.scheduleFrom(this._pausedAt, this._rate)
      this._armEndTimer()
      this.dispatchEvent(new Event('play'))
    })
  }

  pause() {
    if (this._paused) return
    this._pausedAt = this.currentTime
    this._paused = true
    this.bandSynth.cancelAll()
    clearTimeout(this._endTimer)
  }

  _armEndTimer() {
    clearTimeout(this._endTimer)
    const remainingMs = ((this.duration - this._pausedAt) / this._rate) * 1000
    this._endTimer = setTimeout(() => {
      this._paused = true
      this.dispatchEvent(new Event('ended'))
    }, Math.max(0, remainingMs))
  }
}
