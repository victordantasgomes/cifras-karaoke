import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { INSTRUMENTS, SKILL_LEVELS } from '../utils/instruments'

/** Instrumento + nível técnico, repetível — usado no cadastro (SignUp.jsx)
 * e no perfil (ProfileModal.jsx) pra declarar quais instrumentos o usuário
 * toca. `value`/`onChange` controlados pelo pai: array de
 * `{instrument, skill_level}`. */
export default function InstrumentPicker({ value, onChange }) {
  const { t } = useTranslation('instruments')
  const [instrument, setInstrument] = useState('')
  const [skillLevel, setSkillLevel] = useState('')

  const chosen = new Set(value.map((v) => v.instrument))
  const available = INSTRUMENTS.filter((id) => !chosen.has(id))

  const add = () => {
    if (!instrument) return
    onChange([...value, { instrument, skill_level: skillLevel }])
    setInstrument('')
    setSkillLevel('')
  }

  const remove = (id) => onChange(value.filter((v) => v.instrument !== id))

  return (
    <div>
      {value.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {value.map((v) => (
            <span key={v.instrument} className="chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {t(`names.${v.instrument}`)}
              {v.skill_level && <span style={{ opacity: 0.7 }}>· {t(`skillLevels.${v.skill_level}`)}</span>}
              <button type="button" onClick={() => remove(v.instrument)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}
                aria-label={t('picker.remove')}>×</button>
            </span>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select className="input" style={{ flex: '1 1 160px' }} value={instrument}
            onChange={(e) => setInstrument(e.target.value)}>
            <option value="">{t('picker.instrumentPlaceholder')}</option>
            {available.map((id) => <option key={id} value={id}>{t(`names.${id}`)}</option>)}
          </select>
          <select className="input" style={{ flex: '1 1 140px' }} value={skillLevel}
            onChange={(e) => setSkillLevel(e.target.value)}>
            <option value="">{t('picker.skillLevelPlaceholder')}</option>
            {SKILL_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{t(`skillLevels.${lvl}`)}</option>)}
          </select>
          <button type="button" className="btn" disabled={!instrument} onClick={add}>{t('picker.add')}</button>
        </div>
      )}
    </div>
  )
}
