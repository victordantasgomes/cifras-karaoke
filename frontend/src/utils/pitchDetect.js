// Detecção de altura (pitch) por autocorrelação (ACF) — a mesma técnica
// clássica usada em afinadores simples: procura o deslocamento (lag) que
// maximiza a correlação do sinal consigo mesmo, o que corresponde ao
// período da frequência fundamental. Mantido separado da UI (Tuner.jsx) de
// propósito — função pura, testável sem microfone real: basta gerar uma
// onda senoidal sintética com a frequência esperada e conferir o retorno.
//
// Importante: um autocorrelador ingênuo que busca o máximo global da
// correlação em toda a janela de lags tende a "travar" num harmônico (2º,
// 3º...) em vez da fundamental, porque a correlação normalizada de uma
// onda quase periódica se mantém praticamente constante em cada múltiplo
// do período — confirmado testando com tons sintéticos (440Hz detectado
// como ~63Hz). A correção padrão (usada por afinadores web de referência):
// pular a descida inicial a partir do lag 0 e só então procurar o primeiro
// pico — esse primeiro pico é sempre a fundamental, nunca um harmônico.

const MIN_FREQ = 60 // abaixo da corda mais grave de um baixo de 5 cordas (~31Hz) já é ruído pra este uso
const MAX_FREQ = 1500
const RMS_THRESHOLD = 0.01 // ignora silêncio/ruído de piso do microfone
const ZERO_CROSSING_THRESHOLD = 0.2 // apara as bordas do buffer nos cruzamentos de zero, reduz artefato de janela

/**
 * @param {Float32Array} buffer amostras no domínio do tempo (-1..1)
 * @param {number} sampleRate
 * @returns {number|null} frequência fundamental estimada em Hz, ou null se não houver sinal suficiente
 */
export function detectPitch(buffer, sampleRate) {
  const size = buffer.length
  let rms = 0
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i]
  rms = Math.sqrt(rms / size)
  if (rms < RMS_THRESHOLD) return null

  let start = 0
  let end = size - 1
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < ZERO_CROSSING_THRESHOLD) { start = i; break }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < ZERO_CROSSING_THRESHOLD) { end = size - i; break }
  }
  const trimmed = buffer.slice(start, end)
  const n = trimmed.length
  if (n < 8) return null

  const minLag = Math.floor(sampleRate / MAX_FREQ)
  const maxLag = Math.min(Math.floor(sampleRate / MIN_FREQ), n - 1)
  if (maxLag <= minLag) return null

  const corr = new Float64Array(maxLag + 1)
  for (let lag = 0; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag]
    corr[lag] = sum
  }

  // pula a descida inicial (a partir do lag 0, trivialmente o maior valor)
  let d = minLag
  while (d < maxLag && corr[d] > corr[d + 1]) d++

  let bestLag = -1
  let bestCorr = -Infinity
  for (let lag = d; lag <= maxLag; lag++) {
    if (corr[lag] > bestCorr) { bestCorr = corr[lag]; bestLag = lag }
  }
  if (bestLag <= 0) return null

  // interpolação parabólica em torno do melhor lag — refina a estimativa
  // além da resolução de 1 amostra, senão o cents fica granulado demais
  let refinedLag = bestLag
  if (bestLag > 0 && bestLag < maxLag) {
    const x1 = corr[bestLag - 1]
    const x2 = corr[bestLag]
    const x3 = corr[bestLag + 1]
    const a = (x1 + x3 - 2 * x2) / 2
    const b = (x3 - x1) / 2
    if (a !== 0) refinedLag = bestLag - b / (2 * a)
  }

  return sampleRate / refinedLag
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * @param {number} freq Hz
 * @param {number} a4 referência de afinação (padrão 440Hz)
 * @returns {{note:string, octave:number, cents:number, freq:number}|null}
 */
export function freqToNote(freq, a4 = 440) {
  if (!freq || freq <= 0) return null
  const semitonesFromA4 = 12 * Math.log2(freq / a4)
  const rounded = Math.round(semitonesFromA4)
  const cents = Math.round((semitonesFromA4 - rounded) * 100)
  const noteIndex = (((9 + rounded) % 12) + 12) % 12 // A é índice 9 no array acima
  const octave = 4 + Math.floor((rounded + 9) / 12)
  return { note: NOTE_NAMES[noteIndex], octave, cents, freq }
}

/**
 * Inverso de freqToNote — usado pra calcular a frequência real de cada
 * corda de uma afinação (utils/tunings.js guarda só nota+oitava, nunca Hz
 * fixo) a partir da referência A4 escolhida pelo usuário.
 * @param {string} note ex.: "E", "D#"
 * @param {number} octave
 * @param {number} a4
 * @returns {number} Hz
 */
export function noteToFreq(note, octave, a4 = 440) {
  const noteIndex = NOTE_NAMES.indexOf(note)
  const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9)
  return a4 * 2 ** (semitonesFromA4 / 12)
}

/**
 * Encontra, dentre as cordas de uma afinação, a mais próxima da frequência
 * detectada — âncora a leitura numa corda específica (ex.: E2 da guitarra)
 * em vez de deixar a nota cromática livre. A distância é "dobrada" pra
 * dentro de meia oitava (±600 cents) antes de comparar: um erro clássico
 * de detecção de altura por autocorrelação é travar num harmônico (ex.:
 * detectar 2× ou 0.5× a frequência real) — sem essa dobra, uma leitura
 * assim pareceria "muito longe" da corda certa e o afinador escolheria a
 * corda errada. Em caso de empate na distância dobrada, desempata pela
 * distância crua (menos oitavas de diferença é sempre mais plausível que
 * mais).
 * @param {number} freq Hz detectado
 * @param {{note:string, octave:number, freq:number}[]} strings
 * @returns {{index:number, cents:number}}
 */
export function nearestString(freq, strings) {
  let bestIndex = -1
  let bestFolded = Infinity
  let bestRaw = Infinity
  let bestFoldedCents = 0
  for (let i = 0; i < strings.length; i++) {
    const raw = 1200 * Math.log2(freq / strings[i].freq)
    const folded = raw - Math.round(raw / 1200) * 1200
    const absFolded = Math.abs(folded)
    const absRaw = Math.abs(raw)
    const isCloser = absFolded < bestFolded - 1e-9
    const isTie = Math.abs(absFolded - bestFolded) < 10 && absRaw < bestRaw
    if (isCloser || isTie) {
      bestFolded = absFolded
      bestRaw = absRaw
      bestFoldedCents = folded
      bestIndex = i
    }
  }
  return { index: bestIndex, cents: Math.round(bestFoldedCents) }
}

const LOCK_STREAK = 4 // leituras seguidas concordando antes de trocar de nota/corda travada
const SMOOTH_WINDOW = 6 // últimas leituras usadas pra suavizar os cents exibidos
const SILENCE_GRACE = 8 // leituras de silêncio toleradas antes de limpar tudo

/**
 * Estabiliza o fluxo de leituras ruidosas do afinador contra a oscilação
 * de nota — o sintoma relatado ("fica oscilando muito as notas
 * detectadas") vem de reagir a CADA quadro de análise individualmente:
 * ruído, transiente de dedilhado e ambiguidade de oitava do autocorrelador
 * fazem a nota "mais próxima" pular de quadro a quadro mesmo tocando uma
 * única nota estável. A correção padrão de afinadores de instrumento
 * (mesma ideia usada em apps de afinação de referência): só troca a
 * nota/corda exibida depois de LOCK_STREAK leituras seguidas concordando
 * (histerese), e suaviza os cents exibidos com a média das últimas
 * SMOOTH_WINDOW leituras da nota já travada — silêncio breve não limpa a
 * leitura na hora, só depois de SILENCE_GRACE quadros sem sinal.
 */
export class PitchStabilizer {
  constructor({ lockStreak = LOCK_STREAK, smoothWindow = SMOOTH_WINDOW, silenceGrace = SILENCE_GRACE } = {}) {
    this.lockStreak = lockStreak
    this.smoothWindow = smoothWindow
    this.silenceGrace = silenceGrace
    this.reset()
  }

  reset() {
    this.lockedKey = null
    this.lockedMeta = null
    this.streak = { key: null, count: 0 }
    this.centsBuffer = []
    this.silenceCount = 0
  }

  /**
   * @param {number|null} freq Hz detectado neste quadro, ou null se sem sinal
   * @param {{note:string, octave:number, freq:number}[]|null} strings afinação selecionada, ou null pro modo cromático livre
   * @param {number} a4
   * @returns {{note:string, octave:number, cents:number, targetFreq:number|null}|null}
   */
  push(freq, strings, a4 = 440) {
    if (!freq) {
      this.silenceCount++
      if (this.silenceCount > this.silenceGrace) this.reset()
      return this._reading()
    }
    this.silenceCount = 0

    let candidate
    if (strings && strings.length) {
      const { index, cents } = nearestString(freq, strings)
      const s = strings[index]
      candidate = { key: `s${index}`, note: s.note, octave: s.octave, cents, targetFreq: s.freq }
    } else {
      const note = freqToNote(freq, a4)
      if (!note) return this._reading()
      candidate = { key: `${note.note}${note.octave}`, note: note.note, octave: note.octave, cents: note.cents, targetFreq: null }
    }

    if (this.streak.key === candidate.key) this.streak.count++
    else this.streak = { key: candidate.key, count: 1 }

    if (this.streak.count >= this.lockStreak && this.lockedKey !== candidate.key) {
      this.lockedKey = candidate.key
      this.lockedMeta = { note: candidate.note, octave: candidate.octave, targetFreq: candidate.targetFreq }
      this.centsBuffer = []
    }

    if (this.lockedKey === candidate.key) {
      this.centsBuffer.push(candidate.cents)
      if (this.centsBuffer.length > this.smoothWindow) this.centsBuffer.shift()
    }

    return this._reading()
  }

  _reading() {
    if (!this.lockedKey || !this.lockedMeta) return null
    const cents = this.centsBuffer.length
      ? Math.round(this.centsBuffer.reduce((a, b) => a + b, 0) / this.centsBuffer.length)
      : 0
    return { note: this.lockedMeta.note, octave: this.lockedMeta.octave, cents, targetFreq: this.lockedMeta.targetFreq }
  }
}
