// Assinatura normalizada de um input físico de pedal — três fontes
// possíveis, cada uma com sua própria API do navegador:
//  - teclado (e.code): a maioria dos foot switches USB/Bluetooth mais
//    baratos se apresenta ao SO como teclado.
//  - gamepad: a Gamepad API não gera evento de botão, só estado
//    consultável (ver useGamepadEvents.js pro polling).
//  - MIDI (inclusive Bluetooth MIDI/BLE-MIDI): pedais vendidos como
//    controlador MIDI (ex.: aparece pareado no SO como "MIDI Pedal") não
//    geram keydown NEM aparecem na Gamepad API — só são visíveis via Web
//    MIDI (navigator.requestMIDIAccess, ver useMidiEvents.js). Sem essa
//    terceira via, esse tipo de pedal fica invisível pro app mesmo já
//    pareado e "conectado" no sistema.
// Funções puras, sem DOM/React, reaproveitadas pela tela de configuração
// (pages/PedalSetup.jsx) e pelo runtime (hooks/usePedalControl.js).

export function signatureFromKeydown(e) {
  return { type: 'keyboard', code: e.code }
}

export function signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad) {
  return { type: 'gamepad', gamepadIndex, buttonIndex, gamepadId: gamepad?.id || '' }
}

/**
 * Decodifica uma mensagem MIDI crua (`MIDIMessageEvent.data`, sempre já
 * resolvida pelo navegador — sem "running status" pra tratar aqui) numa
 * assinatura ESTÁVEL (sem o estado de pressionado, que vai à parte) mais o
 * estado em si:
 *  - Note On/Off: velocidade 0 num Note On é convenção MIDI padrão pra
 *    "soltar" (equivalente a um Note Off explícito) — tratado igual.
 *  - Control Change: a maioria dos pedais manda 127 ao apertar e 0 ao
 *    soltar; o limiar em 64 cobre variações de curva do pedal.
 *  - Program Change: mensagem única, sem "soltar" separado — `pressed: null`
 *    sinaliza pro chamador tratar como um toque instantâneo (down
 *    imediatamente seguido de up).
 * Mensagens de outros tipos (clock, sysex, pitch bend...) retornam `null` —
 * não fazem sentido como botão de pedal.
 */
export function parseMidiMessage(data, deviceId, deviceName) {
  const [status, d1, d2] = data
  const kindByte = status & 0xf0
  const channel = status & 0x0f
  if (kindByte === 0x90) {
    return { signature: { type: 'midi', kind: 'note', channel, number: d1, deviceId, deviceName }, pressed: d2 > 0 }
  }
  if (kindByte === 0x80) {
    return { signature: { type: 'midi', kind: 'note', channel, number: d1, deviceId, deviceName }, pressed: false }
  }
  if (kindByte === 0xb0) {
    return { signature: { type: 'midi', kind: 'cc', channel, number: d1, deviceId, deviceName }, pressed: d2 >= 64 }
  }
  if (kindByte === 0xc0) {
    return { signature: { type: 'midi', kind: 'pc', channel, number: d1, deviceId, deviceName }, pressed: null }
  }
  return null
}

export function signatureEquals(a, b) {
  if (!a || !b || a.type !== b.type) return false
  if (a.type === 'keyboard') return a.code === b.code
  if (a.type === 'midi') {
    // NÃO compara deviceId/deviceName: o mesmo pedal físico aparece pro
    // navegador como uma porta MIDI DIFERENTE por cabo USB e por Bluetooth
    // (transporte diferente, id/nome diferente do lado do SO) — exigir o
    // mesmo dispositivo faria um botão cadastrado com o cabo nunca bater
    // via Bluetooth (e vice-versa), mesmo a mensagem MIDI em si sendo
    // idêntica. kind+canal+número já identifica o botão físico bem o
    // bastante pro caso de uso de foot switch (um dispositivo por vez).
    return a.kind === b.kind && a.channel === b.channel && a.number === b.number
  }
  // gamepadIndex pode variar entre reconexões — bate por índice OU por id
  // do dispositivo (ver comentário em resolveButtonId abaixo).
  return a.buttonIndex === b.buttonIndex && (a.gamepadIndex === b.gamepadIndex || a.gamepadId === b.gamepadId)
}

/** Descrição legível de uma assinatura, pra exibir ao lado do nome do botão
 * na tela de configuração. `t` é a função de tradução (namespace pedalSetup). */
export function signatureLabel(signature, t) {
  if (!signature) return ''
  if (signature.type === 'keyboard') return t('buttons.input.keyboard', { code: signature.code })
  if (signature.type === 'midi') {
    const channel = signature.channel + 1 // canais MIDI são numerados 1-16 pra humanos, 0-15 no protocolo
    if (signature.kind === 'note') return t('buttons.input.midiNote', { note: signature.number, channel })
    if (signature.kind === 'cc') return t('buttons.input.midiCc', { cc: signature.number, channel })
    return t('buttons.input.midiPc', { program: signature.number, channel })
  }
  return t('buttons.input.gamepad', { index: signature.gamepadIndex, button: signature.buttonIndex })
}

/** Acha o botão configurado (de `buttons`, o array de prefs.pedalConfig)
 * cuja assinatura bate com o input recebido — usado tanto pelo runtime
 * quanto pelo indicador de teste ao vivo da tela de configuração. */
export function resolveButtonId(signature, buttons) {
  const match = (buttons || []).find((b) => signatureEquals(b.input, signature))
  return match ? match.id : null
}
