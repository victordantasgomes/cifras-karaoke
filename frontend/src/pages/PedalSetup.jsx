import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { PEDAL_ACTIONS } from '../config/pedalActions'
import { signatureFromKeydown, signatureFromGamepadButton, signatureLabel, resolveButtonId } from '../utils/pedalInput'
import { createComboEngine } from '../utils/pedalComboEngine'
import { useGamepadEvents } from '../hooks/useGamepadEvents'

const EMPTY_CONFIG = { version: 1, buttons: [], assignments: [] }
const FLASH_MS = 320

function newButtonId() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}
function newAssignmentId() {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Tela dedicada de configuração de pedal (foot switch) — substitui o antigo
 * PedalSettingsCard de Settings.jsx (que virou só um resumo com link pra
 * cá). Detecta tanto teclado quanto gamepad (ver utils/pedalInput.js e
 * hooks/useGamepadEvents.js) — a causa raiz do pedal "não detectado" era a
 * detecção antiga ser só via keydown, e boa parte dos foot switches
 * baratos (USB ou Bluetooth pareado no SO) se apresenta como gamepad HID,
 * não teclado. Bluetooth em si não tem tratamento especial: uma vez pareado
 * nas configurações do sistema operacional, o navegador já enxerga o pedal
 * como um teclado ou gamepad comum.
 *
 * Cada botão cadastrado guarda sua ASSINATURA de input (código de tecla, ou
 * índice de gamepad+botão) em prefs.pedalConfig.buttons — o formato exato
 * está documentado em utils/pedalInput.js. `assignments` guarda, num só
 * array, tanto ação de botão único (buttonIds.length===1) quanto de
 * combinação (>=2) — ver utils/pedalComboEngine.js pra como a combinação é
 * detectada em runtime (mesmo motor usado aqui pro indicador "ao vivo" e em
 * hooks/usePedalControl.js durante a música).
 */
export default function PedalSetup() {
  const { t } = useTranslation('pedalSetup')
  const qc = useQueryClient()
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const save = useMutation({
    mutationFn: (pedalConfig) => api.put('/settings', {
      prefs: { ...qc.getQueryData(['settings'])?.prefs, pedalConfig },
    }).then((r) => r.data),
    onSuccess: (d) => qc.setQueryData(['settings'], d),
  })

  const config = settings?.prefs?.pedalConfig || EMPTY_CONFIG
  const buttons = config.buttons || []
  const assignments = config.assignments || []
  const legacyKey = settings?.prefs?.pedalKey
  const showLegacyBanner = Boolean(!settings?.prefs?.pedalConfig && legacyKey)

  const updateConfig = (next) => save.mutate({ version: 1, buttons: next.buttons ?? buttons, assignments: next.assignments ?? assignments })

  // ---------- adicionar botão (captura única) ----------
  const [capturing, setCapturing] = useState(false)
  useEffect(() => {
    if (!capturing) return undefined
    const addButton = (signature) => {
      const id = newButtonId()
      updateConfig({ buttons: [...buttons, { id, label: t('buttons.defaultLabel', { n: buttons.length + 1 }), input: signature }] })
      setCapturing(false)
    }
    const onKeydown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.repeat) return
      e.preventDefault()
      addButton(signatureFromKeydown(e))
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing])
  useGamepadEvents({
    enabled: capturing,
    onButtonDown: (gamepadIndex, buttonIndex, gamepad) => {
      const id = newButtonId()
      updateConfig({
        buttons: [...buttons, {
          id, label: t('buttons.defaultLabel', { n: buttons.length + 1 }),
          input: signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad),
        }],
      })
      setCapturing(false)
    },
  })

  // ---------- indicador "ao vivo": confirma detecção + combinação em tempo real ----------
  const [flashingButtons, setFlashingButtons] = useState(() => new Set())
  const [flashingAssignments, setFlashingAssignments] = useState(() => new Set())
  const flash = (setFn, id) => {
    setFn((prev) => new Set(prev).add(id))
    setTimeout(() => setFn((prev) => { const next = new Set(prev); next.delete(id); return next }), FLASH_MS)
  }

  const engineRef = useRef(null)
  useEffect(() => {
    const engine = createComboEngine({
      assignments,
      onFire: (_actionId, assignment) => flash(setFlashingAssignments, assignment.id),
    })
    engineRef.current = engine
    return () => engine.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments])

  const hasButtons = buttons.length > 0
  useEffect(() => {
    if (!hasButtons) return undefined
    const onDown = (signature) => {
      const buttonId = resolveButtonId(signature, buttons)
      if (!buttonId) return
      flash(setFlashingButtons, buttonId)
      engineRef.current?.handleDown(buttonId)
    }
    const onUp = (signature) => {
      const buttonId = resolveButtonId(signature, buttons)
      if (buttonId) engineRef.current?.handleUp(buttonId)
    }
    const onKeydown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.repeat || capturing) return
      onDown(signatureFromKeydown(e))
    }
    const onKeyup = (e) => { if (!capturing) onUp(signatureFromKeydown(e)) }
    window.addEventListener('keydown', onKeydown)
    window.addEventListener('keyup', onKeyup)
    return () => {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('keyup', onKeyup)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasButtons, buttons, capturing])
  useGamepadEvents({
    enabled: hasButtons && !capturing,
    onButtonDown: (gamepadIndex, buttonIndex, gamepad) => {
      const buttonId = resolveButtonId(signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad), buttons)
      if (!buttonId) return
      flash(setFlashingButtons, buttonId)
      engineRef.current?.handleDown(buttonId)
    },
    onButtonUp: (gamepadIndex, buttonIndex, gamepad) => {
      const buttonId = resolveButtonId(signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad), buttons)
      if (buttonId) engineRef.current?.handleUp(buttonId)
    },
  })

  // ---------- ações por botão único ----------
  const singleAssignmentFor = (buttonId) => assignments.find((a) => a.buttonIds.length === 1 && a.buttonIds[0] === buttonId)
  const setSingleAction = (buttonId, actionId) => {
    const rest = assignments.filter((a) => !(a.buttonIds.length === 1 && a.buttonIds[0] === buttonId))
    updateConfig({ assignments: actionId ? [...rest, { id: newAssignmentId(), buttonIds: [buttonId], actionId }] : rest })
  }
  const renameButton = (buttonId, label) => {
    updateConfig({ buttons: buttons.map((b) => (b.id === buttonId ? { ...b, label } : b)) })
  }
  const removeButton = (buttonId) => {
    updateConfig({
      buttons: buttons.filter((b) => b.id !== buttonId),
      assignments: assignments.filter((a) => !a.buttonIds.includes(buttonId)),
    })
  }

  // ---------- combinações ----------
  const combos = assignments.filter((a) => a.buttonIds.length >= 2)
  const [comboSelection, setComboSelection] = useState(() => new Set())
  const [comboAction, setComboAction] = useState('')
  const toggleComboButton = (buttonId) => {
    setComboSelection((prev) => {
      const next = new Set(prev)
      if (next.has(buttonId)) next.delete(buttonId); else next.add(buttonId)
      return next
    })
  }
  const addCombo = () => {
    if (comboSelection.size < 2 || !comboAction) return
    updateConfig({ assignments: [...assignments, { id: newAssignmentId(), buttonIds: [...comboSelection], actionId: comboAction }] })
    setComboSelection(new Set())
    setComboAction('')
  }
  const removeAssignment = (id) => updateConfig({ assignments: assignments.filter((a) => a.id !== id) })

  const importLegacyKey = () => {
    const id = newButtonId()
    updateConfig({ buttons: [{ id, label: t('buttons.defaultLabel', { n: 1 }), input: { type: 'keyboard', code: legacyKey } }] })
  }
  const dismissLegacyBanner = () => updateConfig(EMPTY_CONFIG)

  const actionLabel = (actionId) => {
    const action = PEDAL_ACTIONS.find((a) => a.id === actionId)
    if (!action) return ''
    return action.songModeGated
      ? `${t(action.labelKey)} — ${t('actions.gatedHint', { mode: action.songModeGated })}`
      : t(action.labelKey)
  }

  const buttonLabel = (buttonId) => buttons.find((b) => b.id === buttonId)?.label || buttonId

  return (
    <>
      <h1 className="page-title">{t('pageTitle')}</h1>
      <div className="page-sub">{t('pageSub')}</div>

      {showLegacyBanner && (
        <div className="card" style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 12px' }}>{t('legacyImport.banner', { key: legacyKey })}</p>
          <div className="row">
            <button className="btn primary" onClick={importLegacyKey}>{t('legacyImport.import')}</button>
            <button className="btn ghost" onClick={dismissLegacyBanner}>{t('legacyImport.dismiss')}</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginBottom: 12 }}>{t('buttons.title')}</h3>

        {!buttons.length && <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('buttons.empty')}</p>}

        {buttons.map((b) => (
          <div className="pedal-row" key={b.id}>
            <span className={`pedal-dot${flashingButtons.has(b.id) ? ' flash' : ''}`} title={t('buttons.testHint')} />
            <input className="input pedal-row-label" value={b.label}
              onChange={(e) => renameButton(b.id, e.target.value)} />
            <span className="pedal-row-sig">{signatureLabel(b.input, t)}</span>
            <select className="input pedal-row-action" value={singleAssignmentFor(b.id)?.actionId || ''}
              onChange={(e) => setSingleAction(b.id, e.target.value)}>
              <option value="">{t('buttons.noAction')}</option>
              {PEDAL_ACTIONS.map((a) => <option key={a.id} value={a.id}>{actionLabel(a.id)}</option>)}
            </select>
            <button className="btn danger ghost" onClick={() => removeButton(b.id)}>{t('buttons.delete')}</button>
          </div>
        ))}

        <div style={{ marginTop: buttons.length ? 14 : 0 }}>
          <button className="btn primary" disabled={capturing} onClick={() => setCapturing(true)}>
            {capturing ? t('buttons.listening') : t('buttons.add')}
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>{t('combos.title')}</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('combos.description')}</p>

        {!combos.length && <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('combos.empty')}</p>}

        {combos.map((a) => (
          <div className="pedal-row" key={a.id}>
            <span className={`pedal-dot${flashingAssignments.has(a.id) ? ' flash' : ''}`} title={t('buttons.testHint')} />
            <span className="row" style={{ flex: '0 0 auto', gap: 6 }}>
              {a.buttonIds.map((id, i) => (
                <span key={id} className="chip">{buttonLabel(id)}{i < a.buttonIds.length - 1 ? ' +' : ''}</span>
              ))}
            </span>
            <span className="pedal-row-action" style={{ color: 'var(--muted)' }}>{actionLabel(a.actionId)}</span>
            <button className="btn danger ghost" onClick={() => removeAssignment(a.id)}>{t('buttons.delete')}</button>
          </div>
        ))}

        {buttons.length >= 2 && (
          <div style={{ marginTop: combos.length ? 14 : 0 }}>
            <div className="row" style={{ marginBottom: 10 }}>
              {buttons.map((b) => (
                <button key={b.id} type="button"
                  className={`btn ghost pedal-combo-chip${comboSelection.has(b.id) ? ' selected' : ''}`}
                  onClick={() => toggleComboButton(b.id)}>
                  {b.label}
                </button>
              ))}
            </div>
            <div className="row">
              <select className="input" style={{ maxWidth: 320 }} value={comboAction} onChange={(e) => setComboAction(e.target.value)}>
                <option value="">{t('combos.selectAction')}</option>
                {PEDAL_ACTIONS.map((a) => <option key={a.id} value={a.id}>{actionLabel(a.id)}</option>)}
              </select>
              <button className="btn primary" disabled={comboSelection.size < 2 || !comboAction} onClick={addCombo}>
                {t('combos.add')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
