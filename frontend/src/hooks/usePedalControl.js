import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useClipQueueStore } from '../store/clipQueueStore'

/**
 * Fio comum entre KaraokeStage.jsx e ScrollPlayer.jsx pro controle por pedal
 * (foot switch) — ver SongEditor.jsx (@modopedal) e clipQueueStore.js. A
 * tecla do pedal é uma preferência do usuário (Settings.jsx), não da
 * música — o que muda por música é só o MODO (`modo_pedal`).
 *
 * Em modo "fila_clipes", cada aperto da tecla toca o próximo clipe (via
 * `clipAudioRef`, um único elemento <audio> reaproveitado — trocar o `src`
 * e chamar play() de novo já interrompe sozinho o clipe anterior, sem
 * precisar pausar explicitamente). Em modo "faixa_completa", cada aperto só
 * repassa pra `onToggleFaixaCompleta` (mesma ação do Space, mas dedicada).
 */
export function usePedalControl(slug, data, onToggleFaixaCompleta) {
  const modoPedal = data?.modo_pedal || ''
  const clips = data?.clips || []
  const clipQueue = useClipQueueStore()
  const clipAudioRef = useRef(null)
  const [clipUrls, setClipUrls] = useState({})

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const pedalKey = settings?.prefs?.pedalKey || null

  useEffect(() => {
    if (modoPedal === 'fila_clipes') clipQueue.load(slug, clips)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, modoPedal])

  // clipes pré-carregados como Blob, mesmo padrão já usado pros samples em
  // KaraokeStage.jsx — assim o pedal dispara sem esperar um round-trip.
  useEffect(() => {
    let cancelled = false
    setClipUrls({})
    if (modoPedal !== 'fila_clipes' || !clips.length) return undefined
    Promise.all(clips.map((c) =>
      api.get(`/songs/${slug}/clips/${c.id}`, { responseType: 'blob' })
        .then((r) => [c.id, URL.createObjectURL(r.data)])
        .catch(() => [c.id, null]),
    )).then((pairs) => { if (!cancelled) setClipUrls(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, modoPedal, clips.length])

  useEffect(() => () => {
    Object.values(clipUrls).forEach((u) => u && URL.revokeObjectURL(u))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const playNextClip = () => {
    const clip = clipQueue.advance()
    if (!clip || !clipAudioRef.current) return
    const url = clipUrls[clip.id]
    if (!url) return
    clipAudioRef.current.src = url
    clipAudioRef.current.currentTime = 0
    clipAudioRef.current.play().catch(() => {})
  }

  const handlePedalPress = () => {
    if (modoPedal === 'fila_clipes') playNextClip()
    else if (modoPedal === 'faixa_completa') onToggleFaixaCompleta()
  }

  // entra no mapa do useHotkeys de quem chamar este hook — só existe se
  // houver tecla configurada E a música tiver algum modo de pedal ligado;
  // nunca substitui a tecla Space fixa (é uma entrada A MAIS no mapa).
  const hotkeyEntry = pedalKey && modoPedal ? { [pedalKey]: handlePedalPress } : {}

  return { modoPedal, clipAudioRef, hotkeyEntry }
}
