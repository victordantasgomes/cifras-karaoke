// Assinatura normalizada de um input físico de pedal — teclado (e.code, já
// que os foot switches USB/Bluetooth mais comuns se apresentam ao SO como
// teclado) ou gamepad (a Gamepad API não gera evento de botão, só estado
// consultável — ver useGamepadEvents.js pro polling). Funções puras, sem
// DOM/React, reaproveitadas pela tela de configuração (pages/PedalSetup.jsx)
// e pelo runtime (hooks/usePedalControl.js).

export function signatureFromKeydown(e) {
  return { type: 'keyboard', code: e.code }
}

export function signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad) {
  return { type: 'gamepad', gamepadIndex, buttonIndex, gamepadId: gamepad?.id || '' }
}

export function signatureEquals(a, b) {
  if (!a || !b || a.type !== b.type) return false
  if (a.type === 'keyboard') return a.code === b.code
  // gamepadIndex pode variar entre reconexões — bate por índice OU por id
  // do dispositivo (ver comentário em resolveButtonId abaixo).
  return a.buttonIndex === b.buttonIndex && (a.gamepadIndex === b.gamepadIndex || a.gamepadId === b.gamepadId)
}

/** Descrição legível de uma assinatura, pra exibir ao lado do nome do botão
 * na tela de configuração. `t` é a função de tradução (namespace pedalSetup). */
export function signatureLabel(signature, t) {
  if (!signature) return ''
  if (signature.type === 'keyboard') return t('buttons.input.keyboard', { code: signature.code })
  return t('buttons.input.gamepad', { index: signature.gamepadIndex, button: signature.buttonIndex })
}

/** Acha o botão configurado (de `buttons`, o array de prefs.pedalConfig)
 * cuja assinatura bate com o input recebido — usado tanto pelo runtime
 * quanto pelo indicador de teste ao vivo da tela de configuração. */
export function resolveButtonId(signature, buttons) {
  const match = (buttons || []).find((b) => signatureEquals(b.input, signature))
  return match ? match.id : null
}
