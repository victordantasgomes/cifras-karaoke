import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { parseChordSymbol } from '../utils/chordParser'
import {
  GUITAR_TUNING, UKULELE_TUNING,
  buildFretVoicings, buildPianoVoicings, chordPitchClasses,
} from '../utils/chordShapes'
import { noteNameToPc, notesToAscendingOffsets } from '../utils/noteNames'
import ChordFretDiagram from './ChordFretDiagram'
import PianoDiagram from './PianoDiagram'

const INSTRUMENTS = [
  ['violao', 'Violão', 6],
  ['teclado', 'Teclado', null],
  ['ukulele', 'Ukulelê', 4],
]

// fallback algorítmico (busca por força bruta, ver chordShapes.js) só entra
// em ação pro que o dicionário curado não cobre — hoje, sobretudo acordes
// com baixo/inversão explícita ("A/C#", "D/F#" etc., ver docs/MARCACAO_CIFRAS.md)
// e qualidades fora das ~15-24 do banco anexado. Cacheado por símbolo, igual
// ao dicionário, já que os mesmos poucos acordes se repetem a música inteira.
const fallbackCache = new Map()
function algorithmicFallback(symbol) {
  if (fallbackCache.has(symbol)) return fallbackCache.get(symbol)
  const parsed = parseChordSymbol(symbol)
  let result = null
  if (parsed) {
    const pcs = chordPitchClasses(parsed)
    result = {
      violao: buildFretVoicings(GUITAR_TUNING, pcs, parsed.root, parsed.bass)
        .map((v) => ({ frets: v.frets, baseFret: v.baseFret })),
      ukulele: buildFretVoicings(UKULELE_TUNING, pcs, parsed.root, parsed.bass)
        .map((v) => ({ frets: v.frets, baseFret: v.baseFret })),
      teclado: buildPianoVoicings(pcs, parsed.root)
        .map((v) => ({ rootPc: parsed.root, notes: v.notes })),
    }
  }
  fallbackCache.set(symbol, result)
  return result
}

function stringRowToVoicing(row) {
  return { frets: row.casas, fingers: row.dedos, baseFret: row.casa_inicial, tuning: row.afinacao }
}
function pianoRowToVoicing(row) {
  const rootPc = noteNameToPc(row.tonica)
  return { rootPc, notes: notesToAscendingOffsets(rootPc, row.notas) }
}

/** Formações pro acorde `symbol` num instrumento: busca no dicionário curado
 * (ver services/chord_dictionary_service.py) e só recorre ao gerador
 * algorítmico quando o dicionário não tem esse símbolo. */
function useInstrumentVoicings(instrumento, symbol) {
  const { data, isLoading } = useQuery({
    queryKey: ['dict-acorde-variacoes', instrumento, symbol],
    queryFn: () => api.get('/acordes/variacoes', { params: { acorde: symbol, instrumento } }).then((r) => r.data),
    enabled: !!symbol,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  return useMemo(() => {
    if (isLoading) return { loading: true, voicings: [] }
    if (data && data.length) {
      const mapper = instrumento === 'teclado' ? pianoRowToVoicing : stringRowToVoicing
      return { loading: false, voicings: data.map(mapper) }
    }
    const fb = algorithmicFallback(symbol)
    return { loading: false, voicings: fb ? fb[instrumento] : [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, data, instrumento, symbol])
}

function InstrumentCard({ title, disabled, onVary, children }) {
  return (
    <div className="chord-diagram-card">
      <div className="chord-diagram-title">{title}</div>
      <div className="chord-diagram-body">{children}</div>
      <button type="button" className="btn" disabled={disabled} onClick={onVary}>variar acorde</button>
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
        {INSTRUMENTS.map(([instrumento, titulo, strings]) => {
          const { loading, voicings } = porInstrumento[instrumento]
          const voicing = voicings[idx[instrumento] % (voicings.length || 1)]
          return (
            <InstrumentCard key={instrumento} title={titulo} disabled={!voicing}
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
