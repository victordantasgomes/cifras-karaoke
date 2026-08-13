import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInstrumentVoicings } from '../hooks/useChordVoicings'
import ChordFretDiagram from './ChordFretDiagram'
import PianoDiagram from './PianoDiagram'

const INSTRUMENTS = [
  ['violao', 6],
  ['teclado', null],
  ['ukulele', 4],
]

function InstrumentCard({ title, disabled, onVary, children }) {
  const { t } = useTranslation('chordDictionary')
  return (
    <div className="chord-diagram-card">
      <div className="chord-diagram-title">{title}</div>
      <div className="chord-diagram-body">{children}</div>
      <button type="button" className="btn" disabled={disabled} onClick={onVary}>{t('hoverCard.vary')}</button>
    </div>
  )
}

/**
 * Mini modal com violão, teclado e ukulelê lado a lado pro acorde `symbol`
 * — montado por ChordSheet.jsx enquanto o mouse pausa sobre um token de
 * acorde reconhecido (ou sobre o próprio modal, pra permitir clicar em
 * "variar acorde" sem ele fechar).
 *
 * As formações vêm do dicionário de acordes curado (mesma fonte da página
 * Dicionário de Acordes — ver ChordDictionary.jsx e
 * services/chord_dictionary_service.py); só cai pro gerador algorítmico
 * antigo (chordShapes.js) quando o símbolo não existe no dicionário.
 *
 * Cada instrumento cicla sua formação de forma independente (índice local,
 * reseta quando o símbolo muda porque o componente é remontado com
 * `key={symbol}` pelo chamador).
 */
export default function ChordHoverCard({ symbol, style, onMouseEnter, onMouseLeave }) {
  const { t } = useTranslation('chordDictionary')
  const [idx, setIdx] = useState({ violao: 0, teclado: 0, ukulele: 0 })
  const bump = (instrumento) => setIdx((s) => ({ ...s, [instrumento]: s[instrumento] + 1 }))

  const violao = useInstrumentVoicings('violao', symbol)
  const teclado = useInstrumentVoicings('teclado', symbol)
  const ukulele = useInstrumentVoicings('ukulele', symbol)
  const porInstrumento = { violao, teclado, ukulele }

  return (
    <div className="chord-hover-card" style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="chord-hover-title">{symbol}</div>
      <div className="chord-diagram-row">
        {INSTRUMENTS.map(([instrumento, strings]) => {
          const { loading, voicings } = porInstrumento[instrumento]
          const voicing = voicings[idx[instrumento] % (voicings.length || 1)]
          return (
            <InstrumentCard key={instrumento} title={t(`instruments.${instrumento}`)} disabled={!voicing}
              onVary={() => bump(instrumento)}>
              {loading ? (
                <div className="chord-diagram-empty">…</div>
              ) : voicing ? (
                instrumento === 'teclado'
                  ? <PianoDiagram rootPc={voicing.rootPc} notes={voicing.notes} />
                  : <ChordFretDiagram frets={voicing.frets} fingers={voicing.fingers}
                      baseFret={voicing.baseFret} tuning={voicing.tuning} strings={strings} />
              ) : (
                <div className="chord-diagram-empty">—</div>
              )}
            </InstrumentCard>
          )
        })}
      </div>
    </div>
  )
}
