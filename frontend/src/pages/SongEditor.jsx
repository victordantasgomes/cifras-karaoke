import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import ChordSheet from '../components/ChordSheet'
import SyncWorkspace from '../components/SyncWorkspace'
import { parseBody } from '../utils/lineClassifier'
import { groupIntoSteps } from '../utils/steps'
import { resolveTimeline, estimateSynthDuration } from '../utils/timeline'
import { tokenizeChordLine, parseChordSymbol } from '../utils/chordParser'
import { buildChordTimeline } from '../utils/chordTimeline'
import { buildBeatGrid } from '../utils/beatGrid'
import { BandSynth } from '../utils/bandSynth'
import { SynthClock } from '../utils/synthClock'

const HEADER_FIELDS = [
  'titulo', 'autor', 'intérprete', 'tom', 'tom_original', 'tom_da_cifra', 'velocidade',
  'ritmomusical', 'introdução', 'tags', 'nota', 'favorita', 'normalizada', 'bpm',
]
const KEYS = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B']

const EXECUTION_MODES = [
  { value: 'rolagem', label: 'Rolagem (rola a página inteira)' },
  { value: 'karaoke', label: 'Karaokê (linha a linha)' },
]
const MODO_PEDAL_OPTIONS = [
  { value: '', label: 'Desligado' },
  { value: 'fila_clipes', label: 'Fila de clipes curtos' },
  { value: 'faixa_completa', label: 'Faixa completa (a de referência, acima)' },
]
const TEMPO_EXECUCAO_RE = /^[0-9]+:[0-5][0-9]$/

// Rótulos de seção mais usados no acervo (convenção "[Texto]" já existente nos arquivos).
const SECTION_LABELS = [
  'Intro', 'Primeira Parte', 'Segunda Parte', 'Pré-Refrão', 'Refrão',
  'Terceira Parte', 'Ponte', 'Solo', 'Final',
]

const HISTORY_DEBOUNCE_MS = 500

/** Insere `prefix` no início da linha onde está o cursor. */
function insertAtLineStart(text, selStart, selEnd, prefix) {
  const lineStart = text.lastIndexOf('\n', selStart - 1) + 1
  const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart)
  return { newText, newStart: selStart + prefix.length, newEnd: selEnd + prefix.length }
}

/** Envolve a seleção atual (ou insere um bloco vazio) entre `[@tipo]` e `[@/tipo]`. */
function wrapBlock(text, selStart, selEnd, tipo) {
  const selected = text.slice(selStart, selEnd)
  const before = text.slice(0, selStart)
  const after = text.slice(selEnd)
  const openTag = `[@${tipo}]`
  const closeTag = `[@/${tipo}]`
  const leadNL = before.length > 0 && !before.endsWith('\n') ? '\n' : ''
  const trailNL = after.length > 0 && !after.startsWith('\n') ? '\n' : ''
  const newText = `${before}${leadNL}${openTag}\n${selected}\n${closeTag}${trailNL}${after}`
  const cursor = before.length + leadNL.length + openTag.length + 1
  return { newText, newStart: cursor, newEnd: cursor + selected.length }
}

const sameHeader = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const TIME_MARK_RE = /^\[t=\d+(?:\.\d+)?\]\s*/

export default function SongEditor() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [header, setHeader] = useState(null)
  const [body, setBody] = useState('')
  const [tab, setTab] = useState('view') // view | edit | versions
  const [dirty, setDirty] = useState(false)
  const autosave = useRef(null)
  const textareaRef = useRef(null)
  const [sectionLabel, setSectionLabel] = useState(SECTION_LABELS[4]) // "Refrão"

  // Desfazer/refazer: historyRef é a fonte da verdade (lida de forma síncrona
  // dentro dos handlers); historyMeta só existe para o React re-renderizar os
  // botões de desfazer/refazer.
  const historyRef = useRef({ stack: [], index: -1 })
  const [historyMeta, setHistoryMeta] = useState({ len: 0, index: -1 })
  const historyTimer = useRef(null)
  const pendingSnapshot = useRef(null)
  const loadedSlug = useRef(null)

  const { data } = useQuery({
    queryKey: ['song', slug],
    queryFn: () => api.get(`/songs/${slug}`).then((r) => r.data),
  })

  // samples já enviados (usado no dropdown de inserir [@sample] e na aba Áudio)
  const { data: samples } = useQuery({
    queryKey: ['song-samples', slug],
    queryFn: () => api.get(`/songs/${slug}/samples`).then((r) => r.data),
  })
  const sampleEntries = samples ? Object.entries(samples) : []
  const [sampleToInsert, setSampleToInsert] = useState('')
  useEffect(() => {
    if (!sampleToInsert && sampleEntries.length) setSampleToInsert(sampleEntries[0][1].nome)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleEntries.length])

  const commitHistory = (next) => {
    historyRef.current = next
    setHistoryMeta({ len: next.stack.length, index: next.index })
  }

  const pushHistorySnapshot = (newHeader, newBody) => {
    const { stack, index } = historyRef.current
    const top = stack[index]
    if (top && top.body === newBody && sameHeader(top.header, newHeader)) return
    const truncated = stack.slice(0, index + 1)
    const nextStack = [...truncated, { header: newHeader, body: newBody }]
    commitHistory({ stack: nextStack, index: nextStack.length - 1 })
  }

  // grava imediatamente qualquer alteração ainda "represada" pelo debounce
  const flushPendingHistory = () => {
    clearTimeout(historyTimer.current)
    historyTimer.current = null
    if (pendingSnapshot.current) {
      const snap = pendingSnapshot.current
      pendingSnapshot.current = null
      pushHistorySnapshot(snap.header, snap.body)
    }
  }

  // agrupa digitação contínua em um único passo de desfazer (pausa de 500ms)
  const scheduleHistoryPush = (newHeader, newBody) => {
    pendingSnapshot.current = { header: newHeader, body: newBody }
    clearTimeout(historyTimer.current)
    historyTimer.current = setTimeout(flushPendingHistory, HISTORY_DEBOUNCE_MS)
  }

  useEffect(() => {
    if (!data) return
    if (loadedSlug.current !== slug) {
      // música nova (ou primeira carga): reseta edição e histórico
      setHeader(data.header)
      setBody(data.body)
      setDirty(false)
      commitHistory({ stack: [{ header: data.header, body: data.body }], index: 0 })
      loadedSlug.current = slug
    } else if (!dirty) {
      // sem edição local pendente: reflete o que veio do servidor (autosave
      // concluído, transposição, favoritar, avaliar) e registra no histórico
      setHeader(data.header)
      setBody(data.body)
      pushHistorySnapshot(data.header, data.body)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const save = useMutation({
    // guarda o que foi realmente enviado, para não marcar como "salvo" uma
    // edição nova feita enquanto esta requisição ainda estava em voo
    mutationFn: async () => {
      const sentHeader = header
      const sentBody = body
      const r = await api.put(`/songs/${slug}`, { header: sentHeader, body: sentBody })
      return { data: r.data, sentHeader, sentBody }
    },
    onSuccess: ({ data: d, sentHeader, sentBody }) => {
      if (sameHeader(sentHeader, header) && sentBody === body) setDirty(false)
      qc.invalidateQueries(['songs'])
      const newSlug = d.slug
      if (newSlug !== slug) navigate(`/musicas/${newSlug}`, { replace: true })
      else qc.invalidateQueries(['song', slug])
    },
  })

  // auto-save (3s após última alteração) — em qualquer aba que produza edição
  // (Editar ou Áudio, ex.: marcação de tempo), não só na aba Editar: uma
  // sessão inteira de tap tempo feita sem nunca abrir a aba Editar não pode
  // se perder silenciosamente.
  useEffect(() => {
    if (!dirty) return
    clearTimeout(autosave.current)
    autosave.current = setTimeout(() => save.mutate(), 3000)
    return () => clearTimeout(autosave.current)
  }, [header, body, dirty]) // eslint-disable-line

  const transpose = useMutation({
    mutationFn: (payload) => api.post(`/songs/${slug}/transpose`, { ...payload, save: true }),
    onSuccess: (r) => {
      flushPendingHistory()
      setHeader(r.data.header)
      setBody(r.data.body)
      setDirty(false)
      pushHistorySnapshot(r.data.header, r.data.body)
      qc.invalidateQueries(['song', slug])
      qc.invalidateQueries(['songs'])
    },
  })

  const normalize = useMutation({
    mutationFn: () => api.post(`/songs/${slug}/normalize`),
    onSuccess: (r) => {
      flushPendingHistory()
      setHeader(r.data.header)
      setBody(r.data.body)
      setDirty(false)
      pushHistorySnapshot(r.data.header, r.data.body)
      qc.invalidateQueries(['songs'])
      const newSlug = r.data.slug
      if (newSlug !== slug) {
        // título ganha sufixo ("... - cifra original"), então o slug muda —
        // marca loadedSlug ANTES de navegar pra o efeito de "música nova"
        // (que reseta o histórico de desfazer) não disparar e apagar o
        // "desfazer imediato" que acabamos de empilhar.
        loadedSlug.current = newSlug
        qc.setQueryData(['song', newSlug], r.data)
        navigate(`/musicas/${newSlug}`, { replace: true })
      } else {
        qc.invalidateQueries(['song', slug])
      }
    },
  })

  const aiSuggest = useMutation({
    mutationFn: () => api.post(`/songs/${slug}/ai-suggest`),
    onSuccess: (r) => {
      const suggestions = r.data
      if (Object.keys(suggestions).length === 0) return
      const newHeader = { ...header, ...suggestions }
      setHeader(newHeader)
      setDirty(true)
      pushHistorySnapshot(newHeader, body)
    },
  })

  const toggleFav = useMutation({
    mutationFn: () => api.post(`/songs/${slug}/favorite`, { value: !(header?.favorita === 'sim') }),
    onSuccess: () => {
      const newHeader = { ...header, favorita: header.favorita === 'sim' ? '' : 'sim' }
      setHeader(newHeader)
      pushHistorySnapshot(newHeader, body)
      qc.invalidateQueries(['song', slug])
      qc.invalidateQueries(['songs'])
    },
  })

  const setRating = useMutation({
    mutationFn: (nota) => api.post(`/songs/${slug}/rating`, { nota }),
    onSuccess: (_res, nota) => {
      const newHeader = { ...header, nota: String(nota) }
      setHeader(newHeader)
      pushHistorySnapshot(newHeader, body)
      qc.invalidateQueries(['song', slug])
    },
  })

  const remove = useMutation({
    mutationFn: () => api.delete(`/songs/${slug}`),
    onSuccess: () => { qc.invalidateQueries(['songs']); navigate('/musicas') },
  })

  // aplica uma transformação de texto+seleção na textarea da cifra e restaura o cursor
  const applyEdit = (fn) => {
    const el = textareaRef.current
    if (!el) return
    flushPendingHistory()
    const { newText, newStart, newEnd } = fn(body, el.selectionStart, el.selectionEnd)
    setBody(newText)
    setDirty(true)
    pushHistorySnapshot(header, newText)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(newStart, newEnd)
    })
  }

  const insertObservacao = (oculta) =>
    applyEdit((text, s, e) => insertAtLineStart(text, s, e, oculta ? '[@observacao:oculta] ' : '[@observacao] '))
  const insertSectionLabel = () =>
    applyEdit((text, s, e) => insertAtLineStart(text, s, e, `[${sectionLabel}]\n`))
  const insertTagBlock = (tipo) =>
    applyEdit((text, s, e) => wrapBlock(text, s, e, tipo))
  const insertSample = (nome) =>
    applyEdit((text, s, e) => insertAtLineStart(text, s, e, `[@sample] ${nome}\n`))

  // aplica uma mudança de corpo "de uma vez" (fora da textarea, ex.: marcação
  // de tempo na aba Áudio) reaproveitando o mesmo histórico de desfazer
  const applyBodyEdit = (newBody) => {
    flushPendingHistory()
    setBody(newBody)
    setDirty(true)
    pushHistorySnapshot(header, newBody)
  }
  const markLineTime = (lineIndex, time) => {
    const lines = body.split('\n')
    if (lineIndex < 0 || lineIndex >= lines.length) return
    const stripped = lines[lineIndex].replace(TIME_MARK_RE, '')
    lines[lineIndex] = `[t=${time.toFixed(2)}] ${stripped}`
    applyBodyEdit(lines.join('\n'))
  }

  const updateBody = (newBody) => {
    setBody(newBody)
    setDirty(true)
    scheduleHistoryPush(header, newBody)
  }
  const updateHeaderField = (field, value) => {
    const newHeader = { ...header, [field]: value }
    setHeader(newHeader)
    setDirty(true)
    scheduleHistoryPush(newHeader, body)
  }

  const canUndo = historyMeta.index > 0
  const canRedo = historyMeta.index < historyMeta.len - 1

  const undo = () => {
    flushPendingHistory()
    const { stack, index } = historyRef.current
    if (index <= 0) return
    const prev = stack[index - 1]
    setHeader(prev.header)
    setBody(prev.body)
    setDirty(!(data && prev.body === data.body && sameHeader(prev.header, data.header)))
    commitHistory({ stack, index: index - 1 })
  }

  const redo = () => {
    flushPendingHistory()
    const { stack, index } = historyRef.current
    if (index >= stack.length - 1) return
    const next = stack[index + 1]
    setHeader(next.header)
    setBody(next.body)
    setDirty(!(data && next.body === data.body && sameHeader(next.header, data.header)))
    commitHistory({ stack, index: index + 1 })
  }

  const discard = () => {
    if (!data) return
    if (!confirm('Descartar as alterações não salvas desta música? Isso não pode ser desfeito.')) return
    clearTimeout(historyTimer.current)
    pendingSnapshot.current = null
    setHeader(data.header)
    setBody(data.body)
    setDirty(false)
    commitHistory({ stack: [{ header: data.header, body: data.body }], index: 0 })
  }

  const handleEditorKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey
    if (!mod) return
    const k = e.key.toLowerCase()
    if (k === 'z' && e.shiftKey) { e.preventDefault(); redo() }
    else if (k === 'z') { e.preventDefault(); undo() }
    else if (k === 'y') { e.preventDefault(); redo() }
    else if (k === 's') { e.preventDefault(); if (dirty) save.mutate() }
  }

  if (!data || !header) return <div className="empty">Carregando…</div>

  const isOwner = !data.user_id || data.user_id === user?.id

  return (
    <>
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">
            {header.favorita === 'sim' && <span className="fav-star">★ </span>}
            {header.titulo || data.titulo}
          </h1>
          <div className="page-sub">
            {header['intérprete']} {header.tom && <>· <span className="chip">{header.tom}</span></>}
            {header.normalizada === 'sim' && <>· <span className="chip" title="Cabeçalho e notação padronizados">🧼 normalizada</span></>}
            {dirty && ' · alterações não salvas'}
          </div>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => navigate(`/karaoke/${slug}`)}>▶ Karaokê</button>
          <button className="btn" onClick={() => toggleFav.mutate()}>
            {header.favorita === 'sim' ? '★ Favorita' : '☆ Favoritar'}
          </button>
          <button className="btn" onClick={() => window.print()}>Imprimir / PDF</button>
          <a className="btn" href={`${api.defaults.baseURL}/songs/${slug}/export`}
            onClick={(e) => { e.preventDefault(); exportTxt(slug, header.titulo) }}>Exportar TXT</a>
          {isOwner && (
            <button className="btn danger" onClick={() => confirm('Excluir esta música? Ela sairá de todos os setlists.') && remove.mutate()}>
              Excluir
            </button>
          )}
        </div>
      </div>

      {!isOwner && (
        <div className="card no-print" style={{ marginBottom: 14, padding: '10px 16px', color: 'var(--muted)' }}>
          Esta música é de outro usuário — editar (incluindo transpor ou normalizar) cria uma
          cópia sua, o original não é alterado. Enviar áudio/samples e excluir ficam restritos a quem criou.
        </div>
      )}

      <div className="row no-print" style={{ margin: '14px 0' }}>
        {['view', 'edit', 'audio', 'versions'].map((t) => (
          <button key={t} className={`btn ${tab === t ? 'primary' : 'ghost'}`} onClick={() => setTab(t)}>
            {t === 'view' ? 'Visualizar' : t === 'edit' ? 'Editar' : t === 'audio' ? 'Áudio' : 'Histórico de versões'}
          </button>
        ))}
        <div className="spacer" style={{ flex: 1 }} />
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Transpor:</span>
        <button className="btn" onClick={() => transpose.mutate({ semitones: -1 })}>−½ tom</button>
        <button className="btn" onClick={() => transpose.mutate({ semitones: 1 })}>+½ tom</button>
        <select className="input" style={{ width: 120 }} value=""
          onChange={(e) => e.target.value && transpose.mutate({ to_key: e.target.value })}>
          <option value="">Para o tom…</option>
          {KEYS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Nota:</span>
        <select className="input" style={{ width: 76 }} value={header.nota || ''}
          onChange={(e) => setRating.mutate(Number(e.target.value))}>
          <option value="">—</option>
          {Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
        </select>
        <button className="btn" disabled={normalize.isPending}
          title="Padroniza cabeçalho, notação de acordes e rótulos de seção — nunca mexe no espaçamento entre acorde e letra"
          onClick={() => normalize.mutate()}>
          {normalize.isPending ? 'Normalizando…' : '🧼 Normalizar'}
        </button>
      </div>

      {tab === 'view' && (
        <div className="card"><ChordSheet body={body} /></div>
      )}

      {tab === 'edit' && (
        <div className="row" style={{ alignItems: 'flex-start' }} onKeyDown={handleEditorKeyDown}>
          <div className="card" style={{ width: 300, flexShrink: 0 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3>Cabeçalho</h3>
              <button className="btn" disabled={aiSuggest.isPending}
                title="Sugere intérprete, tom, ritmo musical e tags com base na letra — só preenche os campos vazios, você revisa e salva"
                onClick={() => aiSuggest.mutate()}>
                {aiSuggest.isPending ? 'Sugerindo…' : '✨ Sugerir com IA'}
              </button>
            </div>
            {aiSuggest.isError && (
              <div className="error-text" style={{ marginBottom: 10 }}>
                {aiSuggest.error?.response?.data?.error || 'Não foi possível gerar sugestões.'}
              </div>
            )}
            {HEADER_FIELDS.map((f) => (
              <div className="field" key={f}>
                <label>@{f}</label>
                <input className="input" value={header[f] || ''}
                  onChange={(e) => updateHeaderField(f, e.target.value)} />
              </div>
            ))}
            <div className="field">
              <label>Modo de execução</label>
              <select className="input" value={header.modoexecucao || 'rolagem'}
                onChange={(e) => updateHeaderField('modoexecucao', e.target.value)}>
                {EXECUTION_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tempo de execução (mm:ss)</label>
              <input className="input" placeholder="ex.: 03:30" value={header.tempoexecucao || ''}
                onChange={(e) => updateHeaderField('tempoexecucao', e.target.value)}
                style={!header.tempoexecucao || TEMPO_EXECUCAO_RE.test(header.tempoexecucao)
                  ? undefined : { borderColor: 'var(--danger)' }} />
              <div className="page-sub" style={{ margin: '4px 0 0', fontSize: 12 }}>
                Duração da música — define a velocidade da rolagem no modo Rolagem.
              </div>
            </div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <h3 style={{ marginBottom: 12 }}>Cifra</h3>
            <div className="row" style={{ marginBottom: 8, gap: 8 }}>
              <select className="input" style={{ width: 160 }} value={sectionLabel}
                onChange={(e) => setSectionLabel(e.target.value)}>
                {SECTION_LABELS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <button type="button" className="btn" title="Insere [Rótulo] antes da linha atual"
                onClick={insertSectionLabel}>+ Rótulo de seção</button>
              <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--stroke)' }} />
              <button type="button" className="btn" title="Marca a linha atual como observação visível no karaokê"
                onClick={() => insertObservacao(false)}>💬 Observação</button>
              <button type="button" className="btn" title="Marca a linha atual como observação oculta (não aparece no karaokê)"
                onClick={() => insertObservacao(true)}>🔒 Observação oculta</button>
              <button type="button" className="btn" title="Envolve o trecho selecionado como solo"
                onClick={() => insertTagBlock('solo')}>🎸 Solo</button>
              <button type="button" className="btn" title="Envolve o trecho selecionado como riff"
                onClick={() => insertTagBlock('riff')}>🎵 Riff</button>
              <button type="button" className="btn" title="Envolve o trecho selecionado como tablatura"
                onClick={() => insertTagBlock('tab')}>🎼 Tablatura</button>
              {sampleEntries.length > 0 && <>
                <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--stroke)' }} />
                <select className="input" style={{ width: 180 }} value={sampleToInsert}
                  onChange={(e) => setSampleToInsert(e.target.value)}>
                  {sampleEntries.map(([id, meta]) => <option key={id} value={meta.nome}>{meta.nome}</option>)}
                </select>
                <button type="button" className="btn" title="Insere [@sample] antes da linha atual — toca sozinho se a linha tiver [t=SEG]"
                  onClick={() => insertSample(sampleToInsert)}>🔊 Sample</button>
              </>}
            </div>
            <textarea ref={textareaRef} className="input" rows={26} value={body}
              onChange={(e) => updateBody(e.target.value)} />
            <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}
                title="Salvar (Ctrl+S)">
                {save.isPending ? 'Salvando…' : 'Salvar'}
              </button>
              <button type="button" className="btn" disabled={!canUndo} onClick={undo}
                title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
              <button type="button" className="btn" disabled={!canRedo} onClick={redo}
                title="Refazer (Ctrl+Shift+Z)">↷ Refazer</button>
              <button type="button" className="btn danger" disabled={!dirty} onClick={discard}
                title="Descartar todas as alterações não salvas">✕ Descartar alterações</button>
              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                Auto-save ativo · cada salvamento gera uma versão no histórico
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'audio' && (
        <AudioTab slug={slug} body={body} markLineTime={markLineTime}
          header={header} updateHeaderField={updateHeaderField} isOwner={isOwner} />
      )}

      {tab === 'versions' && <Versions slug={slug} />}
    </>
  )
}

const INSTRUMENT_FIELDS = [
  ['bateria', '🥁 Bateria'],
  ['guitarra', '🎸 Guitarra'],
  ['baixo', '🎵 Baixo'],
  ['teclado', '🎹 Teclado'],
]

/** true se pelo menos uma linha de acorde da cifra tiver um símbolo
 * reconhecível (ver utils/chordParser.js) — não depende de BPM/tempo
 * resolvido, só do texto cru, então dá pra avisar antes mesmo de tocar. */
function hasRecognizableChord(body) {
  const steps = groupIntoSteps(parseBody(body).filter((e) => e.visivel))
  for (const step of steps) {
    const text = step.kind === 'pair' ? step.chord.text
      : (step.kind === 'single' && step.line.tipo === 'acorde' ? step.line.text : null)
    if (text == null) continue
    for (const tok of tokenizeChordLine(text)) {
      if (parseChordSymbol(tok.raw)) return true
    }
  }
  return false
}

/** Monta o mesmo BandSynth/SynthClock usado no palco de verdade, a partir
 * do body/header em memória — sem round-trip ao backend (mesmo padrão que
 * SyncWorkspace.jsx já usa pra montar uma prévia local). */
function useBandPreview(body, header) {
  const clockRef = useRef(null)
  const [playing, setPlaying] = useState(false)

  const stop = () => {
    if (clockRef.current) {
      clockRef.current.pause()
      clockRef.current.ctx.close()
      clockRef.current = null
    }
    setPlaying(false)
  }

  // AudioTab desmonta ao trocar de aba — para o acompanhamento nesse momento
  useEffect(() => stop, []) // eslint-disable-line

  const play = () => {
    stop()
    const bpm = Number(header.bpm)
    if (!bpm) return
    const steps = groupIntoSteps(parseBody(body).filter((e) => e.visivel))
    const duration = estimateSynthDuration(steps, bpm)
    const resolved = resolveTimeline(steps, duration, 2500)
    const chordTimeline = buildChordTimeline(resolved, duration)
    const { beats } = buildBeatGrid(bpm, duration)
    const instruments = Object.fromEntries(INSTRUMENT_FIELDS.map(([f]) => [f, header[f] === 'sim']))
    const Ctor = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctor()
    const bandSynth = new BandSynth(ctx, { chordTimeline, beatGrid: beats, instruments, duration })
    const clock = new SynthClock(ctx, bandSynth, { duration })
    clockRef.current = clock
    clock.addEventListener('ended', () => setPlaying(false))
    clock.play()
    setPlaying(true)
  }

  return { playing, toggle: playing ? stop : play }
}

function AudioTab({ slug, body, markLineTime, header, updateHeaderField, isOwner }) {
  const qc = useQueryClient()
  const [trackFile, setTrackFile] = useState(null)
  const [sampleFile, setSampleFile] = useState(null)
  const [sampleNome, setSampleNome] = useState('')
  const [trackUrl, setTrackUrl] = useState(null)
  const audioRef = useRef(null)

  const { data: trackBlob, isError: noTrack, isLoading: loadingTrack } = useQuery({
    queryKey: ['song-audio-blob', slug],
    queryFn: () => api.get(`/songs/${slug}/audio`, { responseType: 'blob' }).then((r) => r.data),
    retry: false,
    // não refetcha sozinha: trocar o <audio src> no meio de uma marcação de
    // tempo reseta a reprodução (mesmo problema resolvido no KaraokePlayer)
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  useEffect(() => {
    if (!trackBlob) { setTrackUrl(null); return undefined }
    const url = URL.createObjectURL(trackBlob)
    setTrackUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [trackBlob])

  const uploadTrack = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', trackFile)
      return api.post(`/songs/${slug}/audio`, fd)
    },
    onSuccess: () => { setTrackFile(null); qc.invalidateQueries(['song-audio-blob', slug]) },
  })

  const deleteTrack = useMutation({
    mutationFn: () => api.delete(`/songs/${slug}/audio`),
    onSuccess: () => qc.invalidateQueries(['song-audio-blob', slug]),
  })

  const { data: samples } = useQuery({
    queryKey: ['song-samples', slug],
    queryFn: () => api.get(`/songs/${slug}/samples`).then((r) => r.data),
  })

  const uploadSample = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', sampleFile)
      fd.append('nome', sampleNome)
      return api.post(`/songs/${slug}/samples`, fd)
    },
    onSuccess: () => {
      setSampleFile(null); setSampleNome('')
      qc.invalidateQueries(['song-samples', slug])
    },
  })

  const deleteSample = useMutation({
    mutationFn: (id) => api.delete(`/songs/${slug}/samples/${id}`),
    onSuccess: () => qc.invalidateQueries(['song-samples', slug]),
  })

  const bandPreview = useBandPreview(body, header)
  const chordAvailable = hasRecognizableChord(body)

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Faixa de referência</h3>
        {trackUrl ? (
          <>
            <audio ref={audioRef} controls src={trackUrl} style={{ width: '100%', marginBottom: 10 }} />
            {isOwner && (
              <button className="btn danger" onClick={() => deleteTrack.mutate()} disabled={deleteTrack.isPending}>
                Remover faixa
              </button>
            )}
          </>
        ) : (
          <div className="empty" style={{ padding: '20px 0' }}>
            {loadingTrack ? 'Carregando…' : noTrack ? 'Nenhuma faixa enviada ainda.' : ''}
          </div>
        )}
        {isOwner && (
          <>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Enviar / substituir faixa (mp3, wav…)</label>
              <input className="input" type="file" accept="audio/*" onChange={(e) => setTrackFile(e.target.files[0])} />
            </div>
            <button className="btn primary" disabled={!trackFile || uploadTrack.isPending} onClick={() => uploadTrack.mutate()}>
              {uploadTrack.isPending ? 'Enviando…' : 'Enviar faixa'}
            </button>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <SyncWorkspace body={body} markLineTime={markLineTime}
          trackBlob={trackBlob} trackUrl={trackUrl} audioRef={audioRef} samplesMeta={samples} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Acompanhamento sintetizado</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
          Sintetiza bateria/guitarra/baixo/teclado a partir dos acordes da
          cifra — só assume o palco de karaokê no lugar de uma gravação de
          verdade; se houver uma faixa de referência enviada acima, ela
          sempre tem prioridade.
        </p>
        <div className="field" style={{ maxWidth: 160 }}>
          <label>@bpm (andamento)</label>
          <input className="input" type="number" min="20" max="300" value={header.bpm || ''}
            onChange={(e) => updateHeaderField('bpm', e.target.value)} placeholder="ex.: 90" />
        </div>
        <div className="row" style={{ marginTop: 10, marginBottom: 8 }}>
          {INSTRUMENT_FIELDS.map(([field, label]) => (
            <label key={field} className="row" style={{ gap: 6, opacity: header.bpm ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!header.bpm} checked={header[field] === 'sim'}
                onChange={(e) => updateHeaderField(field, e.target.checked ? 'sim' : '')} />
              {label}
            </label>
          ))}
        </div>
        {!header.bpm && <div className="page-sub">Defina o BPM acima para habilitar os instrumentos.</div>}
        {Boolean(header.bpm) && !chordAvailable && (
          <div className="page-sub">
            Nenhum acorde reconhecido na cifra — baixo/guitarra/teclado ficam em silêncio; só a bateria toca.
          </div>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn primary" disabled={!header.bpm} onClick={bandPreview.toggle}>
            {bandPreview.playing ? '■ Parar' : '▶ Pré-visualizar acompanhamento'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 12 }}>Pedal (foot switch)</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 14px' }}>
          Controle a reprodução com as mãos livres durante a apresentação, usando
          um pedal USB configurado para enviar uma tecla — a tecla em si é
          configurada em Configurações, uma vez só, e vale pra qualquer música.
        </p>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>Modo do pedal nesta música</label>
          <select className="input" value={header.modopedal || ''} disabled={!isOwner}
            onChange={(e) => updateHeaderField('modopedal', e.target.value)}>
            {MODO_PEDAL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {header.modopedal === 'fila_clipes' && <ClipQueueSection slug={slug} isOwner={isOwner} />}
        {header.modopedal === 'faixa_completa' && (
          <div className="page-sub" style={{ marginTop: 10 }}>
            A tecla do pedal liga/desliga a faixa de referência enviada acima.
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Samples / solos</h3>
        {samples && Object.keys(samples).length === 0 && <div className="empty">Nenhum sample enviado.</div>}
        {samples && Object.entries(samples).map(([id, meta]) => (
          <SampleRow key={id} slug={slug} id={id} nome={meta.nome} isOwner={isOwner}
            onDelete={() => deleteSample.mutate(id)} deleting={deleteSample.isPending} />
        ))}
        {isOwner && (
          <div className="row" style={{ marginTop: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Nome do sample</label>
              <input className="input" value={sampleNome} onChange={(e) => setSampleNome(e.target.value)}
                placeholder="ex.: Solo de Guitarra" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Arquivo de áudio</label>
              <input className="input" type="file" accept="audio/*" onChange={(e) => setSampleFile(e.target.files[0])} />
            </div>
            <button className="btn primary" disabled={!sampleFile || !sampleNome.trim() || uploadSample.isPending}
              onClick={() => uploadSample.mutate()}>
              {uploadSample.isPending ? 'Enviando…' : '+ Sample'}
            </button>
          </div>
        )}
        <div className="page-sub" style={{ marginTop: 10 }}>
          Use o botão 🔊 Sample na aba Editar para inserir <code>[@sample] nome</code> na
          cifra no ponto certo — ele só dispara sozinho no karaokê se essa linha
          também tiver um <code>[t=SEG]</code> marcado.
        </div>
      </div>
    </div>
  )
}

function SampleRow({ slug, id, nome, onDelete, deleting, isOwner }) {
  const { data: blob } = useQuery({
    queryKey: ['sample-audio-blob', slug, id],
    queryFn: () => api.get(`/songs/${slug}/samples/${id}`, { responseType: 'blob' }).then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!blob) return undefined
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return (
    <div className="row" style={{ marginBottom: 8, alignItems: 'center' }}>
      <span style={{ minWidth: 160 }}>{nome}</span>
      {url && <audio controls src={url} style={{ height: 32, flex: 1 }} />}
      {isOwner && <button className="btn danger" onClick={onDelete} disabled={deleting}>Excluir</button>}
    </div>
  )
}

function ClipQueueSection({ slug, isOwner }) {
  const qc = useQueryClient()
  const [clipFile, setClipFile] = useState(null)
  const [clipNome, setClipNome] = useState('')

  const { data: clips } = useQuery({
    queryKey: ['song-clips', slug],
    queryFn: () => api.get(`/songs/${slug}/clips`).then((r) => r.data),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['song-clips', slug] })

  const uploadClip = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', clipFile)
      fd.append('nome', clipNome)
      return api.post(`/songs/${slug}/clips`, fd)
    },
    onSuccess: () => { setClipFile(null); setClipNome(''); invalidate() },
  })

  const reorderClips = useMutation({
    mutationFn: (ids) => api.post(`/songs/${slug}/clips/reorder`, { ids }),
    onSuccess: invalidate,
  })

  const deleteClip = useMutation({
    mutationFn: (id) => api.delete(`/songs/${slug}/clips/${id}`),
    onSuccess: invalidate,
  })

  const move = (index, delta) => {
    const target = index + delta
    if (!clips || target < 0 || target >= clips.length) return
    const next = [...clips]
    ;[next[index], next[target]] = [next[target], next[index]]
    reorderClips.mutate(next.map((c) => c.id))
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ marginBottom: 8, fontSize: 14 }}>Fila de clipes</h4>
      {clips && clips.length === 0 && <div className="empty">Nenhum clipe enviado ainda.</div>}
      {clips && clips.map((c, i) => (
        <ClipRow key={c.id} slug={slug} id={c.id} nome={c.nome} isOwner={isOwner}
          onMoveUp={() => move(i, -1)} onMoveDown={() => move(i, 1)}
          canMoveUp={i > 0} canMoveDown={i < clips.length - 1}
          onDelete={() => deleteClip.mutate(c.id)} deleting={deleteClip.isPending} />
      ))}
      {isOwner && (
        <div className="row" style={{ marginTop: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Nome do clipe</label>
            <input className="input" value={clipNome} onChange={(e) => setClipNome(e.target.value)}
              placeholder="ex.: Introdução" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Arquivo de áudio</label>
            <input className="input" type="file" accept="audio/*" onChange={(e) => setClipFile(e.target.files[0])} />
          </div>
          <button className="btn primary" disabled={!clipFile || !clipNome.trim() || uploadClip.isPending}
            onClick={() => uploadClip.mutate()}>
            {uploadClip.isPending ? 'Enviando…' : '+ Clipe'}
          </button>
        </div>
      )}
      <div className="page-sub" style={{ marginTop: 10 }}>
        Cada aperto do pedal toca o próximo clipe da fila, interrompendo o
        anterior se ainda estiver tocando. Depois do último, o pedal não faz
        mais nada até a página ser recarregada.
      </div>
    </div>
  )
}

function ClipRow({ slug, id, nome, isOwner, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onDelete, deleting }) {
  const { data: blob } = useQuery({
    queryKey: ['clip-audio-blob', slug, id],
    queryFn: () => api.get(`/songs/${slug}/clips/${id}`, { responseType: 'blob' }).then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!blob) return undefined
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return (
    <div className="row" style={{ marginBottom: 8, alignItems: 'center' }}>
      {isOwner && (
        <div className="row" style={{ flexDirection: 'column', gap: 2, flexWrap: 'nowrap' }}>
          <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11, lineHeight: 1.4 }}
            disabled={!canMoveUp} title="Mover pra cima" onClick={onMoveUp}>▲</button>
          <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11, lineHeight: 1.4 }}
            disabled={!canMoveDown} title="Mover pra baixo" onClick={onMoveDown}>▼</button>
        </div>
      )}
      <span style={{ minWidth: 160 }}>{nome}</span>
      {url && <audio controls src={url} style={{ height: 32, flex: 1 }} />}
      {isOwner && <button className="btn danger" onClick={onDelete} disabled={deleting}>Excluir</button>}
    </div>
  )
}

function Versions({ slug }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState(null)
  const { data: versions } = useQuery({
    queryKey: ['versions', slug],
    queryFn: () => api.get(`/songs/${slug}/versions`).then((r) => r.data),
  })
  const { data: detail } = useQuery({
    queryKey: ['version', slug, selected],
    queryFn: () => api.get(`/songs/${slug}/versions/${selected}`).then((r) => r.data),
    enabled: !!selected,
  })
  const restore = useMutation({
    mutationFn: (id) => api.post(`/songs/${slug}/versions/${id}/restore`),
    onSuccess: () => { qc.invalidateQueries(['song', slug]); qc.invalidateQueries(['versions', slug]) },
  })

  if (!versions?.length) return <div className="card empty">Nenhuma versão anterior. As versões são criadas a cada salvamento.</div>

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div className="card" style={{ width: 300, flexShrink: 0, padding: 8 }}>
        {versions.map((v) => (
          <div key={v.id} className="song-row" style={{ gridTemplateColumns: '1fr' }}
            onClick={() => setSelected(v.id)}>
            <div className={selected === v.id ? 'title' : 'meta'}>
              {new Date(v.saved_at).toLocaleString('pt-BR')}
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ flex: 1 }}>
        {!selected && <div className="empty">Selecione uma versão para comparar com a atual.</div>}
        {detail && (
          <>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <h3>Diferenças (versão → atual)</h3>
              <button className="btn primary"
                onClick={() => confirm('Restaurar esta versão? A atual irá para o histórico.') && restore.mutate(selected)}>
                Restaurar esta versão
              </button>
            </div>
            <div className="diff">
              {detail.diff.length === 0 && <div className="empty">Sem diferenças no corpo da cifra.</div>}
              {detail.diff.map((l, i) => (
                <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('@') ? 'hunk' : ''}>
                  {l}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

async function exportTxt(slug, titulo) {
  const { data } = await api.get(`/songs/${slug}/export`, { responseType: 'blob' })
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = `${titulo || slug}.txt`
  a.click()
  URL.revokeObjectURL(url)
}
