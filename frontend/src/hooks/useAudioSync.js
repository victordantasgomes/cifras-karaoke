import { useEffect, useRef } from 'react'
import { findActiveIndex } from '../utils/timeline'

/**
 * Loop único de sincronismo de áudio: acompanha o currentTime da faixa
 * principal e, a cada frame, (1) atualiza o índice do passo ativo — só
 * escrito na store quando muda, ritmo de ~1x por passo, não por frame —,
 * (2) escreve o ponto de corte da varredura estilo CDG (--sweep-pct) uma
 * única vez no contêiner `sweepRootRef` e a barra de progresso via mutação
 * direta de estilo (sem passar pelo ciclo de render do React, que não
 * aguentaria 60 atualizações/s numa árvore desse tamanho) — como é uma
 * variável CSS herdada, qualquer linha marcada `.sweep` (uma só, ou várias
 * de um bloco de solo/riff/tab) pinta com o mesmo valor automaticamente —,
 * e (3) dispara os samples cadastrados no instante certo.
 *
 * O loop se auto-suspende quando o áudio está pausado (só roda de novo com
 * o evento 'play'/'seeked') para não gastar CPU à toa enquanto a tela fica
 * aberta parada, ex.: num intervalo do show.
 */
export function useAudioSync({ audioRef, resolvedLines, samples, sampleAudioRefs, sweepRootRef, progressFillRef, audioDuration, onIndexChange }) {
  const triggeredRef = useRef({})
  const lastIndexRef = useRef(-1)
  const rafRef = useRef(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || resolvedLines.length === 0) return
    let prevTime = audio.currentTime
    let cancelled = false

    const tick = () => {
      const currentTime = audio.currentTime

      const idx = findActiveIndex(resolvedLines, currentTime)
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx
        onIndexChange(idx)
      }

      const line = resolvedLines[idx]
      const rootEl = sweepRootRef.current
      if (rootEl && line) {
        const span = Math.max(0.001, line.tEnd - line.t)
        const frac = Math.min(1, Math.max(0, (currentTime - line.t) / span))
        rootEl.style.setProperty('--sweep-pct', `${(frac * 100).toFixed(2)}%`)
      }

      const fillEl = progressFillRef.current
      if (fillEl && audioDuration) {
        fillEl.style.width = `${Math.min(100, (currentTime / audioDuration) * 100)}%`
      }

      for (const s of samples) {
        const el = sampleAudioRefs.current[s.id]
        if (!el) continue
        if (currentTime < s.t) {
          triggeredRef.current[s.id] = false
          continue
        }
        if (prevTime < s.t && currentTime >= s.t && !triggeredRef.current[s.id]) {
          triggeredRef.current[s.id] = true
          try {
            el.currentTime = 0
            el.play().catch(() => {})
          } catch { /* nunca deixa um sample derrubar o loop ao vivo */ }
        }
      }

      prevTime = currentTime
      if (!cancelled && !audio.paused) rafRef.current = requestAnimationFrame(tick)
    }

    const kick = () => { cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(tick) }

    tick() // reflete o estado atual (ex.: um seek) mesmo se estiver pausado
    audio.addEventListener('play', kick)
    audio.addEventListener('seeked', kick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      audio.removeEventListener('play', kick)
      audio.removeEventListener('seeked', kick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioRef, resolvedLines, samples])
}
