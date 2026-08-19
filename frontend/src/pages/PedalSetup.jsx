import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { PEDAL_ACTIONS } from '../config/pedalActions'
import { signatureFromKeydown, signatureFromGamepadButton, signatureLabel, resolveButtonId } from '../utils/pedalInput'
import { createComboEngine } from '../utils/pedalComboEngine'
import { useGamepadEvents } from '../hooks/useGamepadEvents'
import { useMidiEvents } from '../hooks/useMidiEvents'
import { usePedalStatus } from '../hooks/usePedalStatus'

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
 * cá). Detecta teclado, gamepad E MIDI (ver utils/pedalInput.js,
 * hooks/useGamepadEvents.js, hooks/useMidiEvents.js) — a causa raiz do
 * pedal "não detectado" era a detecção antiga ser só via keydown: boa parte
 * dos foot switches baratos (USB ou Bluetooth pareado no SO) se apresenta
 * como gamepad HID, não teclado, e pedais vendidos como controlador MIDI
 * (ex.: aparecem pareados no SO como "MIDI Pedal") não geram keydown NEM
 * aparecem na Gamepad API — só são visíveis via Web MIDI, uma terceira API
 * do navegador totalmente separada das outras duas. Bluetooth em si não tem
 * tratamento especial: uma vez pareado nas configurações do sistema
 * operacional, o navegador já enxerga o pedal como teclado, gamepad ou
 * dispositivo MIDI comum, conforme o que ele realmente é.
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
  const pedalStatus = usePedalStatus()

  const updateConfig = (next) => save.mutate({ version: 1, buttons: next.buttons ?? buttons, assignments: next.assignments ?? assignments })

  // ---------- adicionar botão (captura única) ----------
  const [capturing, setCapturing] = useState(false)
  const addButtonFromSignature = (signature) => {
    const id = newButtonId()
    updateConfig({ buttons: [...buttons, { id, label: t('buttons.defaultLabel', { n: buttons.length + 1 }), input: signature }] })
    setCapturing(false)
  }
  useEffect(() => {
    if (!capturing) return undefined
    const onKeydown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.repeat) return
      e.preventDefault()
      addButtonFromSignature(signatureFromKeydown(e))
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing])
  useGamepadEvents({
    enabled: capturing,
    onButtonDown: (gamepadIndex, buttonIndex, gamepad) => addButtonFromSignature(signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad)),
  })
  useMidiEvents({
    enabled: capturing,
    onButtonDown: (signature) => addButtonFromSignature(signature),
  })

  // ---------- indicador "ao vivo": confirma detecção + combinação em tempo real ----------
  const [flashingButtons, setFlashingButtons] = useState(() => new Set())
  const [flashingAssignments, setFlashingAssignments] = useState(() => new Set())
  const flash = (setFn, id) => {
    setFn((prev) => new Set(prev).add(id))
    setTimeout(() => setFn((prev) => { const next = new Set(prev); next.delete(id); return next }), FLASH_MS)
  }

  // log das últimas ações disparadas — pra testar se a configuração está
  // certa sem precisar abrir uma música de verdade (ver actionLabel abaixo)
  const [testLog, setTestLog] = useState([])
  const logFire = (actionId) => {
    const action = PEDAL_ACTIONS.find((a) => a.id === actionId)
    const entry = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: action ? t(action.labelKey) : actionId, time: new Date().toLocaleTimeString() }
    setTestLog((prev) => [entry, ...prev].slice(0, 8))
  }

  const engineRef = useRef(null)
  useEffect(() => {
    const engine = createComboEngine({
      assignments,
      onFire: (actionId, assignment) => {
        flash(setFlashingAssignments, assignment.id)
        logFire(actionId)
      },
    })
    engineRef.current = engine
    return () => engine.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments])

  const hasButtons = buttons.length > 0
  const handleLiveDown = (signature) => {
    const buttonId = resolveButtonId(signature, buttons)
    if (!buttonId) return
    flash(setFlashingButtons, buttonId)
    engineRef.current?.handleDown(buttonId)
  }
  const handleLiveUp = (signature) => {
    const buttonId = resolveButtonId(signature, buttons)
    if (buttonId) engineRef.current?.handleUp(buttonId)
  }
  useEffect(() => {
    if (!hasButtons) return undefined
    const onKeydown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.repeat || capturing) return
      handleLiveDown(signatureFromKeydown(e))
    }
    const onKeyup = (e) => { if (!capturing) handleLiveUp(signatureFromKeydown(e)) }
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
    onButtonDown: (gamepadIndex, buttonIndex, gamepad) => handleLiveDown(signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad)),
    onButtonUp: (gamepadIndex, buttonIndex, gamepad) => handleLiveUp(signatureFromGamepadButton(gamepadIndex, buttonIndex, gamepad)),
  })
  useMidiEvents({
    enabled: hasButtons && !capturing,
    onButtonDown: handleLiveDown,
    onButtonUp: handleLiveUp,
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

  // "testar numa música real" — abre uma cifra pública de verdade (nunca
  // inventada) numa aba nova; lá o pedal já roda com as ações configuradas
  // aqui, então dá pra experimentar o efeito de verdade (rolagem, troca de
  // linha, etc.), não só o log de nomes de ação abaixo.
  const [testSongState, setTestSongState] = useState('idle') // idle | loading | error
  const testOnRealSong = async () => {
    setTestSongState('loading')
    try {
      const { data } = await api.get('/public/songs', { params: { page_size: 20 } })
      const items = data?.items || []
      if (!items.length) throw new Error('sem músicas públicas')
      const pick = items[Math.floor(Math.random() * items.length)]
      window.open(`/karaoke/${pick.slug}`, '_blank', 'noopener')
      setTestSongState('idle')
    } catch {
      setTestSongState('error')
    }
  }

  const buttonStatus = (buttonId) => pedalStatus.statuses.find((s) => s.button.id === buttonId)?.status || 'unknown'
  const statusLabel = (status) => t(`status.${status}`)

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
        <h3 style={{ marginBottom: 12 }}>{t('devices.title')}</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('devices.hint')}</p>

        <div className="pedal-device-row" style={{ fontWeight: 600, color: 'var(--muted)' }}>
          <span>{t('devices.midiSectionTitle')}</span>
        </div>
        {!pedalStatus.midiInputs.length && <div className="pedal-device-row">{t('devices.midiEmpty')}</div>}
        {pedalStatus.midiInputs.map((i) => (
          <div className="pedal-device-row" key={i.name + i.state}>
            <span>{i.name}</span>
            <span className={i.state === 'connected' ? 'chip' : 'chip'} style={i.state !== 'connected' ? { background: 'var(--danger, #ef5a5f)', color: '#fff' } : undefined}>
              {i.state === 'connected' ? t('status.connected') : t('status.disconnected')}
            </span>
          </div>
        ))}

        <div className="pedal-device-row" style={{ fontWeight: 600, color: 'var(--muted)', marginTop: 10 }}>
          <span>{t('devices.gamepadSectionTitle')}</span>
        </div>
        {!pedalStatus.gamepads.length && <div className="pedal-device-row">{t('devices.gamepadEmpty')}</div>}
        {pedalStatus.gamepads.map((g) => (
          <div className="pedal-device-row" key={g.id}>
            <span>{g.id}</span>
            <span className="chip">{t('status.connected')}</span>
          </div>
        ))}

        <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '14px 0 0' }}>{t('devices.batteryNote')}</p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginBottom: 12 }}>{t('buttons.title')}</h3>

        {!buttons.length && <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('buttons.empty')}</p>}

        {buttons.map((b) => (
          <div className="pedal-row" key={b.id}>
            <span className={`pedal-dot status-${buttonStatus(b.id)}${flashingButtons.has(b.id) ? ' flash' : ''}`}
              title={`${statusLabel(buttonStatus(b.id))} — ${t('buttons.testHint')}`} />
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

      <div className="card" style={{ marginBottom: 14 }}>
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

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>{t('testLog.title')}</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('testLog.description')}</p>

        {!testLog.length && <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>{t('testLog.empty')}</p>}
        {testLog.map((entry) => (
          <div className="pedal-log-entry" key={entry.id}>
            <strong>{entry.label}</strong> — {entry.time}
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={testSongState === 'loading'} onClick={testOnRealSong}>
            {testSongState === 'loading' ? t('testLog.testSongLoading') : t('testLog.testSongButton')}
          </button>
          <p style={{ color: 'var(--muted)', fontSize: 12.5, margin: '10px 0 0' }}>{t('testLog.testSongHint')}</p>
          {testSongState === 'error' && <p style={{ color: 'var(--danger, #ef5a5f)', margin: '8px 0 0' }}>{t('testLog.testSongError')}</p>}
        </div>
      </div>
    </>
  )
}
