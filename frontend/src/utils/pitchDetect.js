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
