import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../services/api'
import { useDebounce } from '../hooks/useDebounce'
import ChordFretDiagram from '../components/ChordFretDiagram'
import PianoDiagram from '../components/PianoDiagram'
import { noteNameToPc, notesToAscendingOffsets } from '../utils/noteNames'
import {
  playChordNotes, GUITAR_OPEN_MIDI, UKULELE_OPEN_MIDI,
  stringVoicingToMidi, pianoVoicingToMidi,
} from '../utils/chordPlayer'

const INSTRUMENTS = [
  { value: 'violao', label: 'Violão' },
  { value: 'ukulele', label: 'Ukulelê' },
  { value: 'teclado', label: 'Teclado' },
]

const FAVORITES_KEY = 'chordDictionaryFavorites'

function loadFavorites() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'))
  } catch {
    return new Set()
  }
}
function persistFavorites(set) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]))
}

const COMBINING_MARKS_RE = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g',
)
function normalize(s) {
  return (s || '').normalize('NFKD').replace(COMBINING_MARKS_RE, '').toLowerCase()
}

function downloadSvg(svgEl, filename) {
  const clone = svgEl.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const text = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([text], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Dicionário de acordes (violão, ukulelê, teclado) — dados vêm do banco CSV
 * anexado (ver backend/resources/acordes e services/chord_dictionary_service.py).
 * As digitações de instrumentos de corda foram normalizadas por regras
 * harmônicas/critérios de tocabilidade, não dedilhadas por um músico — daí o
 * aviso fixo abaixo do título (ver README anexado, seção "Observação sobre a
 * origem"). As posições de teclado derivam direto da teoria musical
 * (fundamental + inversões), então são verificáveis por construção.
 *
 * Favoritos são só locais (localStorage) — não há tela de administração/
 * curadoria nem persistência por usuário no backend para isso ainda.
 */
export default function ChordDictionary() {
  const [instrumento, setInstrumento] = useState('violao')
  const [q, setQ] = useState('')
  const debouncedQ = useDebounce(q)
  const [filtros, setFiltros] = useState({ tonica: '', qualidade: '', dificuldade: '', pestana: '' })
  const [favoritosOnly, setFavoritosOnly] = useState(false)
  const [favoritos, setFavoritos] = useState(loadFavorites)
  const [selecionado, setSelecionado] = useState('')
  const [variacaoIdx, setVariacaoIdx] = useState(0)
  const [mirror, setMirror] = useState(false)
  const [enarmonico, setEnarmonico] = useState(false)
  const [showFormulas, setShowFormulas] = useState(false)
  const diagramRef = useRef(null)

  // dificuldade/pestana não existem pro teclado — limpa ao trocar de aba
  useEffect(() => {
    setFiltros((f) => ({ ...f, dificuldade: '', pestana: '' }))
  }, [instrumento])

  const { data: facetas } = useQuery({
    queryKey: ['acordes-facetas', instrumento],
    queryFn: () => api.get('/acordes/facetas', { params: { instrumento } }).then((r) => r.data),
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ['acordes-list', instrumento, filtros.tonica, filtros.qualidade, filtros.dificuldade, filtros.pestana],
    queryFn: () => api.get('/acordes', {
      params: {
        instrumento, tonica: filtros.tonica, qualidade: filtros.qualidade,
        dificuldade: filtros.dificuldade, pestana: filtros.pestana, page_size: 2000,
      },
    }).then((r) => r.data),
  })

  const { data: qualidadesMap } = useQuery({
    queryKey: ['qualidades'],
    queryFn: () => api.get('/qualidades').then((r) => r.data),
    staleTime: Infinity,
  })

  const rows = listData?.items || []
  const grouped = useMemo(() => {
    const map = new Map()
    for (const row of rows) if (!map.has(row.acorde)) map.set(row.acorde, row)
    let list = [...map.values()]
    const alvo = normalize(debouncedQ)
    if (alvo) {
      list = list.filter((r) =>
        normalize(r.acorde).includes(alvo) || normalize(r.acorde_enarmonico || '').includes(alvo) ||
        normalize(r.tonica_pt).includes(alvo) || normalize(r.qualidade).includes(alvo))
    }
    if (favoritosOnly) list = list.filter((r) => favoritos.has(`${instrumento}:${r.acorde}`))
    list.sort((a, b) => a.acorde.localeCompare(b.acorde))
    return list
  }, [rows, debouncedQ, favoritosOnly, favoritos, instrumento])

  // seleciona o primeiro acorde da lista quando nada (ou algo que sumiu do filtro) está selecionado
  useEffect(() => {
    if (!grouped.length) return
    if (!grouped.some((r) => r.acorde === selecionado)) setSelecionado(grouped[0].acorde)
  }, [grouped, selecionado])

  const { data: variacoes } = useQuery({
    queryKey: ['acordes-variacoes', instrumento, selecionado],
    queryFn: () => api.get('/acordes/variacoes', { params: { acorde: selecionado, instrumento } }).then((r) => r.data),
    enabled: !!selecionado,
  })

  useEffect(() => { setVariacaoIdx(0) }, [selecionado, instrumento])

  const lista = variacoes || []
  const atual = lista[variacaoIdx % (lista.length || 1)]

  const transpor = useMutation({
    mutationFn: (semitons) => api.post('/acordes/transpor', { acorde: selecionado, semitons, instrumento }).then((r) => r.data),
    onSuccess: (d) => { if (d.variacoes?.length) setSelecionado(d.transposto) },
  })

  const favKey = selecionado ? `${instrumento}:${selecionado}` : null
  const isFav = favKey ? favoritos.has(favKey) : false
  const toggleFavorite = (key) => {
    const next = new Set(favoritos)
    if (next.has(key)) next.delete(key); else next.add(key)
    setFavoritos(next)
    persistFavorites(next)
  }

  const ouvirAcorde = () => {
    if (!atual) return
    if (instrumento === 'teclado') {
      const rootPc = noteNameToPc(atual.tonica)
      const offsets = notesToAscendingOffsets(rootPc, atual.notas)
      playChordNotes(pianoVoicingToMidi(rootPc, offsets))
    } else {
      const openMidi = instrumento === 'violao' ? GUITAR_OPEN_MIDI : UKULELE_OPEN_MIDI
      playChordNotes(stringVoicingToMidi(atual.casas, openMidi))
    }
  }

  const baixarSvg = () => {
    const svg = diagramRef.current?.querySelector('svg')
    if (svg) downloadSvg(svg, `${selecionado || 'acorde'}-${instrumento}.svg`)
  }

  const irParaTom = (novaTonica) => {
    if (!atual || !novaTonica) return
    const atualPc = noteNameToPc(atual.tonica)
    const alvoPc = noteNameToPc(novaTonica)
    if (atualPc == null || alvoPc == null) return
    const semitons = ((alvoPc - atualPc) % 12 + 12) % 12
    if (semitons) transpor.mutate(semitons)
  }

  const tituloAcorde = enarmonico && atual?.acorde_enarmonico ? atual.acorde_enarmonico : selecionado

  return (
    <>
      <h1 className="page-title">Dicionário de acordes</h1>
      <div className="page-sub">Violão, ukulelê e teclado — busque um acorde, veja as variações e ouça.</div>

      <div className="card chord-dict-banner no-print">
        As digitações de violão e ukulelê deste dicionário foram normalizadas por fórmula harmônica e critérios
        automatizados de tocabilidade — não foram dedilhadas à mão por um músico. Recomendamos uma etapa de
        curadoria/validação musical antes de tratar como referência editorial definitiva. As posições de teclado
        derivam diretamente da teoria musical (fundamental + inversões), portanto são verificáveis por construção.
      </div>

      <div className="row no-print" style={{ marginBottom: 14 }}>
        {INSTRUMENTS.map((i) => (
          <button key={i.value} className={`btn ${instrumento === i.value ? 'primary' : 'ghost'}`}
            onClick={() => setInstrumento(i.value)}>{i.label}</button>
        ))}
      </div>

      <div className="row no-print" style={{ marginBottom: 16 }}>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar acorde (ex.: Cmaj7, Dm7, F#)"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 130 }} value={filtros.tonica}
          onChange={(e) => setFiltros({ ...filtros, tonica: e.target.value })}>
          <option value="">Tônica</option>
          {facetas?.tonicas.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="input" style={{ maxWidth: 240 }} value={filtros.qualidade}
          onChange={(e) => setFiltros({ ...filtros, qualidade: e.target.value })}>
          <option value="">Qualidade</option>
          {facetas?.qualidades.map((qq) => <option key={qq} value={qq}>{qq}</option>)}
        </select>
        {instrumento !== 'teclado' && (
          <>
            <select className="input" style={{ maxWidth: 160 }} value={filtros.dificuldade}
              onChange={(e) => setFiltros({ ...filtros, dificuldade: e.target.value })}>
              <option value="">Dificuldade</option>
              {facetas?.dificuldades?.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="input" style={{ maxWidth: 150 }} value={filtros.pestana}
              onChange={(e) => setFiltros({ ...filtros, pestana: e.target.value })}>
              <option value="">Pestana</option>
              <option value="1">Com pestana</option>
              <option value="0">Sem pestana</option>
            </select>
          </>
        )}
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" checked={favoritosOnly} onChange={(e) => setFavoritosOnly(e.target.checked)} />
          Só favoritas
        </label>
      </div>

      <div className="chord-dict-layout">
        <div className="card chord-dict-list no-print">
          {isLoading && <div className="empty">Carregando…</div>}
          {!isLoading && grouped.length === 0 && <div className="empty">Nenhum acorde encontrado.</div>}
          {grouped.map((r) => {
            const key = `${instrumento}:${r.acorde}`
            return (
              <div key={r.acorde} className={`chord-dict-row${selecionado === r.acorde ? ' active' : ''}`}
                onClick={() => setSelecionado(r.acorde)}>
                <div>
                  <div className="title">{r.acorde}</div>
                  <div className="meta">{r.tonica_pt} · {r.qualidade}</div>
                </div>
                <button type="button" className="fav-toggle"
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(key) }} title="Favoritar">
                  {favoritos.has(key) ? '★' : '☆'}
                </button>
              </div>
            )
          })}
        </div>

        <div className="card chord-dict-detail">
          {!atual && <div className="empty">Selecione um acorde na lista.</div>}
          {atual && (
            <>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h2 className="chord-dict-title">
                    {tituloAcorde}
                    {atual.acorde_enarmonico && (
                      <button type="button" className="btn ghost" style={{ marginLeft: 10, fontSize: 12, padding: '4px 8px' }}
                        onClick={() => setEnarmonico((v) => !v)} title="Alternar grafia sustenido/bemol">
                        ⇄ {enarmonico ? selecionado : atual.acorde_enarmonico}
                      </button>
                    )}
                  </h2>
                  <div className="page-sub" style={{ margin: '2px 0 0' }}>
                    {atual.tonica_pt} · {atual.qualidade} · fórmula {atual.formula_intervalar}
                  </div>
                </div>
                <button className="btn" onClick={() => toggleFavorite(favKey)}>{isFav ? '★ Favorito' : '☆ Favoritar'}</button>
              </div>

              <div className="row" style={{ margin: '14px 0' }}>
                <button className="btn" onClick={() => setVariacaoIdx((i) => (i - 1 + lista.length) % lista.length)}
                  disabled={lista.length < 2}>‹</button>
                <span className="meta">
                  {instrumento === 'teclado'
                    ? `${atual.inversao_nome} (${(variacaoIdx % lista.length) + 1}/${lista.length})`
                    : `Variação ${(variacaoIdx % lista.length) + 1} de ${lista.length}`}
                </span>
                <button className="btn" onClick={() => setVariacaoIdx((i) => (i + 1) % lista.length)}
                  disabled={lista.length < 2}>›</button>
                <div className="spacer" style={{ flex: 1 }} />
                {instrumento !== 'teclado' && (
                  <label className="row" style={{ gap: 6 }}>
                    <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
                    Modo canhoto
                  </label>
                )}
                <button className="btn" onClick={ouvirAcorde}>🔊 Ouvir acorde</button>
                <button className="btn" onClick={baixarSvg}>⭳ Baixar SVG</button>
              </div>

              <div className="chord-dict-diagram-wrap" ref={diagramRef}>
                {instrumento === 'teclado' ? (
                  <PianoDiagram rootPc={noteNameToPc(atual.tonica)}
                    notes={notesToAscendingOffsets(noteNameToPc(atual.tonica), atual.notas)} />
                ) : (
                  <ChordFretDiagram frets={atual.casas} fingers={atual.dedos} baseFret={atual.casa_inicial}
                    strings={instrumento === 'violao' ? 6 : 4} tuning={atual.afinacao} mirror={mirror} />
                )}
              </div>

              <div className="row" style={{ flexWrap: 'wrap', gap: 8, margin: '12px 0' }}>
                {instrumento !== 'teclado' && <span className="chip">{atual.dificuldade}</span>}
                {instrumento !== 'teclado' && atual.pestana?.tem && <span className="chip">Pestana</span>}
                <span className="chip">Baixo: {instrumento === 'teclado' ? atual.baixo_sugerido : atual.baixo}</span>
                <span className="chip">Notas: {atual.notas.filter((n) => n !== 'X').join(' · ')}</span>
              </div>

              {instrumento !== 'teclado' && atual.pestana?.detalhe && (
                <div className="page-sub" style={{ margin: '0 0 10px' }}>{atual.pestana.detalhe}</div>
              )}
              {instrumento === 'teclado' && (
                <div className="page-sub" style={{ margin: '0 0 10px' }}>
                  Mão esquerda: {atual.mao_esquerda_sugerida} · Mão direita: {atual.mao_direita_sugerida} · {atual.oitava_referencia}
                </div>
              )}

              <div className="row no-print" style={{ margin: '10px 0' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>Transpor:</span>
                <button className="btn" onClick={() => transpor.mutate(-1)}>−1 semitom</button>
                <button className="btn" onClick={() => transpor.mutate(1)}>+1 semitom</button>
                <select className="input" style={{ width: 150 }} value=""
                  onChange={(e) => e.target.value && irParaTom(e.target.value)}>
                  <option value="">Ir para o tom…</option>
                  {facetas?.tonicas.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card no-print" style={{ marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={() => setShowFormulas((v) => !v)}>
          {showFormulas ? '▾' : '▸'} Fórmulas de qualidades de acorde
        </button>
        {showFormulas && qualidadesMap && (
          <div className="chord-dict-formulas">
            {Object.entries(qualidadesMap).map(([slug, info]) => (
              <div key={slug} className="chord-dict-formula-row">
                <span className="title">{info.name}</span>
                <span className="meta">{info.formula}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
