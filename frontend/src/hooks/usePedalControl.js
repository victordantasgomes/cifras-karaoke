import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { useClipQueueStore } from '../store/clipQueueStore'
import { signatureFromKeydown, signatureFromGamepadButton, resolveButtonId } from '../utils/pedalInput'
import { createComboEngine } from '../utils/pedalComboEngine'
import { useGamepadEvents } from './useGamepadEvents'

/**
 * Fio comum entre KaraokeStage.jsx e ScrollPlayer.jsx pro controle por pedal
 * (foot switch) — ver SongEditor.jsx (@modopedal), clipQueueStore.js e a
 * tela de configuração em pages/PedalSetup.jsx (prefs.pedalConfig).
 *
 * `pedalActions` é um objeto `{ [actionId]: fn }` com os handlers que ESTA
 * página sabe executar (ex.: `{ toggle_play: togglePlay, restart, ... }`,
 * ver ScrollPlayer.jsx/KaraokeStage.jsx) — cada botão/combinação configurado
 * pelo usuário aponta pra um id do catálogo (config/pedalActions.js); se o
 * id disparado não tiver handler nesta página (ex.: "próxima linha" em
 * ScrollPlayer, que não tem esse conceito), a chamada é simplesmente um
 * no-op, mesmo princípio de uma tecla sem entrada no mapa de useHotkeys.
 *
 * `fila_clipes` continua tratado à parte (não é uma ação como as outras: o
 * hook é quem é dono do áudio/fila) — quando `modo_pedal==='fila_clipes'`, o
 * id `clip_queue_next` é resolvido internamente pra `playNextClip`, ignorando
 * (se houver) um handler de mesmo nome vindo de `pedalActions`.
 */
export function usePedalControl(slug, data, pedalActions) {
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
    refetchOnReconnect: false,
  })
  const pedalConfig = settings?.prefs?.pedalConfig
  const buttons = useMemo(() => pedalConfig?.buttons || [], [pedalConfig])
  const assignments = useMemo(() => pedalConfig?.assignments || [], [pedalConfig])

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

  // handlers "vivos" num ref pra o engine (recriado só quando assignments
  // muda) sempre chamar a versão mais recente sem precisar recriar a cada
  // render de ScrollPlayer/KaraokeStage.
  const liveHandlers = useRef({})
  liveHandlers.current = { ...pedalActions, clip_queue_next: modoPedal === 'fila_clipes' ? playNextClip : pedalActions?.clip_queue_next }

  const engineRef = useRef(null)
  useEffect(() => {
    const engine = createComboEngine({
      assignments,
      onFire: (actionId) => liveHandlers.current[actionId]?.(),
    })
    engineRef.current = engine
    return () => engine.destroy()
  }, [assignments])

  const hasPedal = buttons.length > 0

  useEffect(() => {
    if (!hasPedal) return undefined
    const handleDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.repeat) return
      const buttonId = resolveButtonId(signatureFromKeydown(e), buttons)
      if (!buttonId) return
      e.preventDefault()
      engineRef.current?.handleDown(buttonId)
    }
    const handleUp = (e) => {
      const buttonId = resolveButtonId(signatureFromKeydown(e), buttons)
      if (buttonId) engineRef.current?.handleUp(buttonId)
    }
    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
    }
  }, [hasPedal, buttons])

  useGamepadEvents({
    enabled: hasPedal,
    onButtonDown: (gamepadIndex, buttonIndex, gamepad) => {
      const buttonId = resolveButtonId(signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad), buttons)
      if (buttonId) engineRef.current?.handleDown(buttonId)
    },
    onButtonUp: (gamepadIndex, buttonIndex, gamepad) => {
      const buttonId = resolveButtonId(signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad), buttons)
      if (buttonId) engineRef.current?.handleUp(buttonId)
    },
  })

  return { modoPedal, clipAudioRef }
}
