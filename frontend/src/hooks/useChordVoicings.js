import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { parseChordSymbol } from '../utils/chordParser'
import {
  GUITAR_TUNING, UKULELE_TUNING,
  buildFretVoicings, buildPianoVoicings, chordPitchClasses,
} from '../utils/chordShapes'
import { noteNameToPc, notesToAscendingOffsets } from '../utils/noteNames'

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
 * algorítmico quando o dicionário não tem esse símbolo. Compartilhado por
 * ChordHoverCard.jsx (hover na cifra) e KaraokeChordSidebar.jsx (assistente
 * fixo do player karaokê) — mesma fonte de dados, dois lugares de exibição. */
export function useInstrumentVoicings(instrumento, symbol) {
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
