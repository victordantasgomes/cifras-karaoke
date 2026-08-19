// Máquina de estados pura (sem DOM/React) que resolve bordas down/up de
// botões configurados em ids de AÇÃO disparados — cobre tanto botão único
// (dispara na hora, sem latência) quanto combinação de 2+ botões
// pressionados dentro de uma janela curta (dispara só a ação combinada, não
// as individuais). Compartilhada pelo runtime (usePedalControl.js) e pelo
// indicador de teste ao vivo da tela de configuração (PedalSetup.jsx) — o
// que o usuário vê confirmado ali é exatamente o que vai disparar na hora H.

const COMBO_WINDOW_MS = 220

/**
 * @param {{assignments: {id:string, buttonIds:string[], actionId:string}[], onFire: (actionId:string, assignment:object) => void}} opts
 */
export function createComboEngine({ assignments = [], onFire }) {
  const singleByButton = new Map() // buttonId -> assignment (buttonIds.length === 1)
  const combosByButton = new Map() // buttonId -> assignment[] (buttonIds.length >= 2, participando)
  for (const a of assignments) {
    if (a.buttonIds.length === 1) {
      singleByButton.set(a.buttonIds[0], a)
    } else {
      for (const id of a.buttonIds) {
        if (!combosByButton.has(id)) combosByButton.set(id, [])
        combosByButton.get(id).push(a)
      }
    }
  }

  const state = new Map() // buttonId -> 'down' | 'consumed'
  const downAt = new Map() // buttonId -> timestamp
  const timers = new Map() // buttonId -> timeout handle

  const fireSingle = (buttonId) => {
    const assignment = singleByButton.get(buttonId)
    if (assignment) onFire(assignment.actionId, assignment)
  }

  const clearTimer = (buttonId) => {
    const t = timers.get(buttonId)
    if (t) { clearTimeout(t); timers.delete(buttonId) }
  }

  function handleDown(buttonId) {
    const combos = combosByButton.get(buttonId)
    if (!combos || !combos.length) {
      fireSingle(buttonId)
      return
    }
    const now = Date.now()
    state.set(buttonId, 'down')
    downAt.set(buttonId, now)

    const completed = combos.find((a) =>
      a.buttonIds.every((id) => id === buttonId || (state.get(id) === 'down' && now - downAt.get(id) <= COMBO_WINDOW_MS)),
    )
    if (completed) {
      completed.buttonIds.forEach((id) => { state.set(id, 'consumed'); clearTimer(id) })
      onFire(completed.actionId, completed)
      return
    }

    clearTimer(buttonId)
    timers.set(buttonId, setTimeout(() => {
      if (state.get(buttonId) === 'down') { fireSingle(buttonId); state.set(buttonId, 'idle') }
      timers.delete(buttonId)
    }, COMBO_WINDOW_MS))
  }

  function handleUp(buttonId) {
    if (state.get(buttonId) === 'down') {
      clearTimer(buttonId)
      fireSingle(buttonId)
    }
    state.set(buttonId, 'idle')
    downAt.delete(buttonId)
  }

  function destroy() {
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
  }

  return { handleDown, handleUp, destroy }
}
