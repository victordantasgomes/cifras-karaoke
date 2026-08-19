import { useTranslation } from 'react-i18next'
import { usePedalStatus } from '../hooks/usePedalStatus'
import { IconPedal } from './icons'

/**
 * Ícone compacto de status do pedal pro cabeçalho do player (ScrollPlayer.jsx/
 * KaraokeStage.jsx) — só aparece quando o usuário tem pedal configurado (sem
 * poluir a tela de quem não usa). Verde = nenhum botão conhecidamente
 * desconectado; vermelho = pelo menos um gamepad/MIDI configurado não está
 * respondendo agora (o sinal mais direto de "o pedal parou/nunca conectou").
 * Botão de teclado nunca conta contra o status — não existe API de
 * conectividade de teclado no navegador, ver usePedalStatus.js.
 */
export default function PedalStatusBadge() {
  const { t } = useTranslation('pedalSetup')
  const status = usePedalStatus()
  if (!status.configured) return null

  const ok = status.overall === 'connected'
  const label = status.keyboardOnly
    ? t('playerBadge.keyboardOnly')
    : ok
      ? t('playerBadge.connected', { count: status.connectedCount, total: status.total })
      : t('playerBadge.disconnected', { count: status.connectedCount, total: status.total })

  return (
    <span className="pedal-status-badge" title={label}>
      <IconPedal />
      <span className={`pedal-status-dot${ok ? ' ok' : ' bad'}`} />
    </span>
  )
}
