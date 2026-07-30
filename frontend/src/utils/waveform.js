// Decodifica um Blob de áudio em uma waveform simplificada (picos por
// "balde"), usada só para desenho — nenhum dado sai do navegador.

/**
 * @param {Blob} blob
 * @param {number} buckets número de colunas da waveform desenhada
 * @returns {Promise<{peaks: Float32Array, duration: number}>}
 */
export async function decodePeaks(blob, buckets = 1200) {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  const ctx = new AudioContextCtor()
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    const data = audioBuffer.getChannelData(0) // primeiro canal já basta pro desenho
    const bucketSize = Math.max(1, Math.floor(data.length / buckets))
    const peaks = new Float32Array(buckets)
    for (let b = 0; b < buckets; b++) {
      let max = 0
      const start = b * bucketSize
      const end = Math.min(data.length, start + bucketSize)
      for (let i = start; i < end; i++) {
        const v = Math.abs(data[i])
        if (v > max) max = v
      }
      peaks[b] = max
    }
    return { peaks, duration: audioBuffer.duration }
  } finally {
    ctx.close()
  }
}
