// Resolve o tempo de início/fim de cada linha da cifra a partir dos
// marcadores [t=SEG] explícitos (parciais — o usuário não precisa marcar
// toda linha), interpolando/extrapolando o resto com a duração real do
// áudio (ou, na ausência dela, o cronômetro legado de ms_per_line).

/**
 * @param {{text:string, tipo:string, t:number|null}[]} lines
 * @param {number|null} audioDuration duração real do áudio em segundos, ou null se ainda não carregou
 * @param {number} msPerLine cronômetro legado, usado só como espaçamento de fallback
 * @returns {{text:string, tipo:string, t:number, tEnd:number}[]}
 */
export function resolveTimeline(lines, audioDuration, msPerLine) {
  const n = lines.length
  if (n === 0) return []

  const fallbackSpacing = msPerLine / 1000

  // âncoras válidas: t não nulo, estritamente crescente, dentro da duração
  // do áudio quando ela já é conhecida
  const anchors = []
  let lastT = -Infinity
  for (let i = 0; i < n; i++) {
    const t = lines[i].t
    if (t == null) continue
    if (audioDuration != null && t > audioDuration) continue
    if (t <= lastT) continue
    anchors.push({ i, t })
    lastT = t
  }

  const t = new Array(n)

  if (anchors.length === 0) {
    const spacing = audioDuration != null ? audioDuration / n : fallbackSpacing
    for (let i = 0; i < n; i++) t[i] = i * spacing
  } else {
    for (const a of anchors) t[a.i] = a.t

    // entre âncoras: interpolação linear por índice de linha
    for (let k = 0; k < anchors.length - 1; k++) {
      const a = anchors[k], b = anchors[k + 1]
      const span = b.i - a.i
      for (let i = a.i + 1; i < b.i; i++) {
        t[i] = a.t + (b.t - a.t) * (i - a.i) / span
      }
    }

    // antes da primeira âncora: extrapola de trás pra frente a partir de 0
    const first = anchors[0]
    if (first.i > 0) {
      const spacing = anchors.length > 1
        ? (anchors[1].t - first.t) / (anchors[1].i - first.i)
        : (first.t > 0 ? first.t / first.i : fallbackSpacing)
      for (let i = 0; i < first.i; i++) {
        t[i] = Math.max(0, first.t - (first.i - i) * spacing)
      }
    }

    // depois da última âncora: usa a duração real quando dá, senão o
    // espaçamento entre as duas últimas âncoras, senão o fallback
    const last = anchors[anchors.length - 1]
    if (last.i < n - 1) {
      const remaining = n - 1 - last.i
      let spacing
      if (audioDuration != null && audioDuration > last.t) {
        spacing = (audioDuration - last.t) / remaining
      } else if (anchors.length > 1) {
        const prev = anchors[anchors.length - 2]
        spacing = (last.t - prev.t) / (last.i - prev.i)
      } else {
        spacing = fallbackSpacing
      }
      for (let i = last.i + 1; i < n; i++) {
        t[i] = last.t + (i - last.i) * spacing
      }
    }
  }

  const tEnd = new Array(n)
  for (let i = 0; i < n - 1; i++) tEnd[i] = t[i + 1]
  const lastSpacing = n > 1 ? Math.max(0.001, t[n - 1] - t[n - 2]) : fallbackSpacing
  tEnd[n - 1] = audioDuration != null ? Math.max(audioDuration, t[n - 1] + 0.001) : t[n - 1] + lastSpacing

  return lines.map((l, i) => ({ ...l, t: t[i], tEnd: tEnd[i] }))
}

/**
 * Estima a duração de uma música que só tem acompanhamento sintetizado
 * (sem áudio real enviado, ver utils/bandSynth.js) — ANTES de chamar
 * `resolveTimeline`, que precisa de uma duração como entrada; isso resolve
 * o "ovo e galinha". Usa a última âncora [t=SEG] como base e extrapola o
 * espaçamento médio pelos passos restantes, mais uma cauda de alguns
 * tempos pro último acorde soar até o fim. Sem nenhuma âncora, cai num
 * fallback grosseiro (1 compasso de 4 tempos por passo).
 *
 * @param {{t:number|null}[]} steps passos CRUS (antes de resolveTimeline)
 * @param {number} bpm
 * @param {{tailBeats?:number}} opts
 */
export function estimateSynthDuration(steps, bpm, { tailBeats = 4 } = {}) {
  const beatDur = 60 / Math.max(1, bpm || 90)
  const anchors = []
  steps.forEach((s, i) => { if (s.t != null) anchors.push({ i, t: s.t }) })

  let base
  if (anchors.length === 0) {
    base = steps.length * beatDur * 4
  } else {
    const last = anchors[anchors.length - 1]
    const stepsAfter = steps.length - 1 - last.i
    const secPerStep = anchors.length >= 2
      ? (last.t - anchors[0].t) / Math.max(1, last.i - anchors[0].i)
      : beatDur * 4
    base = last.t + stepsAfter * secPerStep
  }
  const withTail = base + tailBeats * beatDur
  return Math.ceil(withTail / beatDur) * beatDur
}

/** Último índice cujo t <= currentTime (assume t não-decrescente). Busca binária. */
export function findActiveIndex(resolvedLines, currentTime) {
  const n = resolvedLines.length
  if (n === 0) return 0
  if (currentTime <= resolvedLines[0].t) return 0
  if (currentTime >= resolvedLines[n - 1].t) return n - 1
  let lo = 0, hi = n - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (resolvedLines[mid].t <= currentTime) lo = mid
    else hi = mid - 1
  }
  return lo
}
