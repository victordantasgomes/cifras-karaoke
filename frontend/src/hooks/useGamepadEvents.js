import { useEffect, useRef } from 'react'

/**
 * Botão de gamepad NÃO gera evento no navegador — só `gamepadconnected`/
 * `gamepaddisconnected` são eventos reais (conexão/desconexão do
 * dispositivo). Pra saber quando um botão foi pressionado/solto é preciso
 * sondar `navigator.getGamepads()` a cada frame e comparar `.pressed` contra
 * o frame anterior — é isso que este hook faz, gerando bordas de
 * descida/subida (`onButtonDown`/`onButtonUp`) equivalentes a keydown/keyup.
 *
 * Só roda enquanto `enabled` (tela de configuração aberta, ou um player com
 * pedal configurado montado) — sem custo de CPU/bateria em nenhuma outra
 * página. Muitos navegadores só populam `getGamepads()` depois de algum
 * gesto do usuário na página — não é algo corrigível aqui, mas na prática
 * não é problema: a UI que usa este hook já exige clique/foco antes.
 */
export function useGamepadEvents({ enabled, onButtonDown, onButtonUp }) {
  const prevRef = useRef({})
  const callbacksRef = useRef({ onButtonDown, onButtonUp })
  callbacksRef.current = { onButtonDown, onButtonUp }

  useEffect(() => {
    if (!enabled) return undefined
    let raf
    const tick = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      for (const pad of pads) {
        if (!pad) continue
        pad.buttons.forEach((btn, i) => {
          const key = `${pad.index}:${i}`
          const was = prevRef.current[key] || false
          const isPressed = btn.pressed
          if (isPressed && !was) callbacksRef.current.onButtonDown?.(pad.index, i, pad)
          if (!isPressed && was) callbacksRef.current.onButtonUp?.(pad.index, i, pad)
          prevRef.current[key] = isPressed
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled])
}
