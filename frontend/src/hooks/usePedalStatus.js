import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'

/**
 * Status de conectividade do pedal configurado — compartilhado entre a tela
 * de configuração (pages/PedalSetup.jsx, diagnóstico detalhado) e o badge
 * compacto do player (components/PedalStatusBadge.jsx). Só é possível saber
 * conectividade de verdade pras fontes gamepad e MIDI:
 *  - gamepad: `gamepadconnected`/`gamepaddisconnected` são eventos reais do
 *    navegador — não precisa de polling só pra saber se está conectado
 *    (polling só é necessário pra saber se um BOTÃO foi apertado, ver
 *    useGamepadEvents.js).
 *  - MIDI: `MIDIInput.state` ('connected'/'disconnected') + `onstatechange`
 *    da MIDIAccess, mesma ideia.
 *  - teclado: NÃO EXISTE API de "este teclado está conectado" no navegador
 *    — um evento de tecla só existe no instante em que é pressionada. Todo
 *    botão de teclado fica com status 'unknown' (nem verde nem vermelho),
 *    nunca falsamente "conectado".
 */
export function usePedalStatus() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const buttons = settings?.prefs?.pedalConfig?.buttons || []

  const [gamepads, setGamepads] = useState(() => new Map())
  useEffect(() => {
    const sync = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      const next = new Map()
      for (const p of pads) if (p) next.set(p.index, { id: p.id, connected: p.connected !== false })
      setGamepads(next)
    }
    sync()
    window.addEventListener('gamepadconnected', sync)
    window.addEventListener('gamepaddisconnected', sync)
    return () => {
      window.removeEventListener('gamepadconnected', sync)
      window.removeEventListener('gamepaddisconnected', sync)
    }
  }, [])

  const [midiInputs, setMidiInputs] = useState(() => new Map())
  useEffect(() => {
    if (!navigator.requestMIDIAccess) return undefined
    let cancelled = false
    let access = null
    const sync = () => {
      if (!access) return
      const next = new Map()
      for (const input of access.inputs.values()) next.set(input.id, { name: input.name, state: input.state })
      setMidiInputs(next)
    }
    navigator.requestMIDIAccess({ sysex: false }).then((a) => {
      if (cancelled) return
      access = a
      sync()
      access.onstatechange = sync
    }).catch(() => {})
    return () => { cancelled = true; if (access) access.onstatechange = null }
  }, [])

  const statusFor = (button) => {
    const input = button.input
    if (input.type === 'keyboard') return 'unknown'
    if (input.type === 'gamepad') {
      const pad = gamepads.get(input.gamepadIndex)
      return pad && pad.connected ? 'connected' : 'disconnected'
    }
    // midi: acha por id OU nome (a mesma porta pode reaparecer com um id
    // novo entre reconexões — ver pedalInput.js)
    const match = [...midiInputs.values()].find((i) => i.name === input.deviceName)
      || midiInputs.get(input.deviceId)
    return match && match.state === 'connected' ? 'connected' : 'disconnected'
  }

  const statuses = buttons.map((b) => ({ button: b, status: statusFor(b) }))
  // só gamepad/MIDI entram na contagem "X de Y respondendo" — teclado
  // ('unknown') não tem como ser verificado, então nem soma nem subtrai do
  // placar (senão um pedal 100% por teclado, que é a maioria, apareceria
  // pra sempre como "0 de N conectados" mesmo funcionando perfeitamente).
  const trackedStatuses = statuses.filter((s) => s.status !== 'unknown')
  const connectedCount = trackedStatuses.filter((s) => s.status === 'connected').length
  const disconnectedCount = trackedStatuses.filter((s) => s.status === 'disconnected').length
  const total = trackedStatuses.length
  const configured = buttons.length > 0
  const keyboardOnly = configured && total === 0

  return {
    configured,
    buttons,
    statuses,
    connectedCount,
    disconnectedCount,
    total,
    keyboardOnly,
    // resumo pra um badge único: verde se não há nada verificável
    // desconectado (nem nada pra verificar, no caso 100%-teclado); vermelho
    // se algum gamepad/MIDI configurado está sem resposta agora.
    overall: !configured ? 'unconfigured' : disconnectedCount > 0 ? 'disconnected' : 'connected',
    gamepads: [...gamepads.values()],
    midiInputs: [...midiInputs.values()],
  }
}
