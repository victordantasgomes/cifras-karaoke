import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePedalStatus } from '../hooks/usePedalStatus'
import { useGamepadEvents } from '../hooks/useGamepadEvents'
import { useMidiEvents } from '../hooks/useMidiEvents'
import { signatureFromKeydown, signatureFromGamepadButton, resolveButtonId } from '../utils/pedalInput'
import { IconPedal } from './icons'

const FLASH_MS = 320

/**
 * Ícone compacto de status do pedal pro cabeçalho do player (ScrollPlayer.jsx/
 * KaraokeStage.jsx) — só aparece quando o usuário tem pedal configurado (sem
 * poluir a tela de quem não usa). Verde = nenhum botão conhecidamente
 * desconectado; vermelho = pelo menos um gamepad/MIDI configurado não está
 * respondendo agora (o sinal mais direto de "o pedal parou/nunca conectou").
 * Botão de teclado nunca conta contra o status — não existe API de
 * conectividade de teclado no navegador, ver usePedalStatus.js.
 *
 * Além do status "frio" (conectado/desconectado), o ponto pisca ao detectar
 * um aperto de verdade — usa seus PRÓPRIOS listeners de teclado/gamepad/MIDI
 * (não lê nada de usePedalControl.js), de propósito: assim dá pra saber, só
 * de olhar pro cabeçalho durante uma música, se o problema é a DETECÇÃO (o
 * ponto nunca pisca) ou a AÇÃO configurada pro botão (o ponto pisca, mas a
 * música não reage) — os dois sintomas têm causas bem diferentes.
 */
export default function PedalStatusBadge() {
  const { t } = useTranslation('pedalSetup')
  const status = usePedalStatus()
  const buttons = status.buttons

  const [flashing, setFlashing] = useState(false)
  const flashTimer = useRef(null)
  const flash = () => {
    setFlashing(true)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashing(false), FLASH_MS)
  }
  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const hasButtons = buttons.length > 0
  useEffect(() => {
    if (!hasButtons) return undefined
    const onKeydown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.repeat) return
      if (resolveButtonId(signatureFromKeydown(e), buttons)) flash()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasButtons, buttons])
  useGamepadEvents({
    enabled: hasButtons,
    onButtonDown: (gamepadIndex, buttonIndex, gamepad) => {
      if (resolveButtonId(signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad), buttons)) flash()
    },
  })
  useMidiEvents({
    enabled: hasButtons,
    onButtonDown: (signature) => { if (resolveButtonId(signature, buttons)) flash() },
  })

  if (!status.configured) return null

  const ok = status.overall === 'connected'
  const label = flashing
    ? t('playerBadge.detected')
    : status.keyboardOnly
      ? t('playerBadge.keyboardOnly')
      : ok
        ? t('playerBadge.connected', { count: status.connectedCount, total: status.total })
        : t('playerBadge.disconnected', { count: status.connectedCount, total: status.total })

  return (
    <span className="pedal-status-badge" title={label}>
      <IconPedal />
      <span className={`pedal-status-dot${flashing ? ' flash' : ok ? ' ok' : ' bad'}`} />
    </span>
  )
}
