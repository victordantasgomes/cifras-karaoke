import { useEffect, useRef } from 'react'
import { parseMidiMessage } from '../utils/pedalInput'

/**
 * Pedais vendidos como controlador MIDI (inclusive pareados via Bluetooth/
 * BLE-MIDI — aparecem no SO como "conectado", mas isso não os torna um
 * teclado ou gamepad de verdade) só são visíveis ao navegador pela Web MIDI
 * API (`navigator.requestMIDIAccess`), uma terceira via totalmente separada
 * de keydown/Gamepad API — ver utils/pedalInput.js pro porquê. Diferente de
 * gamepad, MIDI já é orientado a evento (cada mensagem chega pronta via
 * `onmidimessage`), sem necessidade de polling.
 *
 * `sysex: false` (padrão) evita o prompt de permissão extra que o acesso a
 * mensagens de sistema exclusivo pediria — nenhum pedal de foot switch
 * precisa disso. Dispositivos plugados/pareados DEPOIS do mount (Bluetooth
 * conectando com atraso) são cobertos via `midiAccess.onstatechange`.
 */
export function useMidiEvents({ enabled, onButtonDown, onButtonUp }) {
  const callbacksRef = useRef({ onButtonDown, onButtonUp })
  callbacksRef.current = { onButtonDown, onButtonUp }

  useEffect(() => {
    if (!enabled || !navigator.requestMIDIAccess) return undefined
    let cancelled = false
    const attached = new Map() // input -> handler, pra remover certo no cleanup

    const attach = (input) => {
      if (attached.has(input)) return
      const handler = (e) => {
        const parsed = parseMidiMessage(e.data, input.id, input.name)
        if (!parsed) return
        if (parsed.pressed === null) {
          // program change: mensagem única, sem "soltar" — toque instantâneo
          callbacksRef.current.onButtonDown?.(parsed.signature)
          callbacksRef.current.onButtonUp?.(parsed.signature)
        } else if (parsed.pressed) {
          callbacksRef.current.onButtonDown?.(parsed.signature)
        } else {
          callbacksRef.current.onButtonUp?.(parsed.signature)
        }
      }
      input.addEventListener('midimessage', handler)
      attached.set(input, handler)
    }

    navigator.requestMIDIAccess({ sysex: false }).then((midiAccess) => {
      if (cancelled) return
      for (const input of midiAccess.inputs.values()) attach(input)
      midiAccess.onstatechange = (e) => {
        if (cancelled || e.port.type !== 'input' || e.port.state !== 'connected') return
        attach(e.port)
      }
    }).catch(() => {})

    return () => {
      cancelled = true
      attached.forEach((handler, input) => input.removeEventListener('midimessage', handler))
    }
  }, [enabled])
}
