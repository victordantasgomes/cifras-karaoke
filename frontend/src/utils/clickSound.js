// Clique percussivo curto para a contagem regressiva do karaokê (como um
// baterista contando o tempo com baquetas) — sintetizado via Web Audio API,
// sem depender de nenhum arquivo de áudio, então funciona pra qualquer
// música sem precisar de upload extra.

let ctx = null

export function playClick() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return
  if (!ctx) ctx = new AudioContextCtor()

  const duration = 0.05
  const n = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  // ruído branco com decaimento exponencial — dá o "tic" seco de uma baqueta,
  // não um tom musical
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3

  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 2500
  source.connect(filter).connect(ctx.destination)
  source.start()
}
