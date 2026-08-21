import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import api from '../services/api'
import { keyIndex } from '../utils/musicalKey'

function shuffle(arr) {
  const next = [...arr]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function reorder(list, from, to) {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// comparador genérico: valores ausentes (null/undefined/'') sempre vão pro
// fim, nas duas direções — sort estável (Array.prototype.sort é estável)
// preserva a ordem original entre empates/ausências, em vez de embaralhar.
function compareBy(valueFn, direction = 1) {
  return (a, b) => {
    const va = valueFn(a)
    const vb = valueFn(b)
    const aEmpty = va === null || va === undefined || va === ''
    const bEmpty = vb === null || vb === undefined || vb === ''
    if (aEmpty && bEmpty) return 0
    if (aEmpty) return 1
    if (bEmpty) return -1
    if (typeof va === 'string') return va.localeCompare(vb) * direction
    return (va - vb) * direction
  }
}

// blocos de medley (SetlistDetail.jsx::buildMedleyItems) viram uma unidade
// só pra ordenar — nunca quebra um grupo, nunca reordena dentro dele; usa o
// primeiro membro como critério de comparação. `key` é o índice original do
// primeiro membro — estável mesmo depois de reordenar, e único mesmo quando
// a MESMA música aparece duas vezes no setlist (só o `ref` não bastaria
// como key do React nesse caso — colidiria e confundia o DOM entre as duas
// cópias ao reordenar).
function groupByMedley(items) {
  const groups = []
  let i = 0
  while (i < items.length) {
    const mid = items[i].medley_id
    const key = i
    if (!mid) { groups.push({ key, members: [items[i]] }); i += 1; continue }
    const members = [items[i]]
    let j = i + 1
    while (j < items.length && items[j].medley_id === mid) { members.push(items[j]); j += 1 }
    groups.push({ key, members })
    i = j
  }
  return groups
}

function groupLabel(members) {
  if (members.length === 1) return members[0].song?.titulo || members[0].ref
  return `🔗 ${members.map((it) => it.song?.titulo || it.ref).join(', ')}`
}

export default function PlaylistOrderModal({ setlistId, items, onApply, onClose }) {
  const { t } = useTranslation('setlistDetail')
  // instantâneo dos itens no momento em que o modal abre — sem isso, um
  // refetch em segundo plano (foco de janela voltando, edição concorrente
  // em outra aba) troca a prop `items` debaixo do usuário enquanto ele
  // ajusta a prévia, e "Aplicar" acabaria salvando uma lista dessincronizada
  // do que ele realmente viu/organizou no modal.
  const [snapshotItems] = useState(items)
  const [formatId, setFormatId] = useState(null)
  const [previewGroups, setPreviewGroups] = useState(() => groupByMedley(snapshotItems))

  // "Ritmo (ordem personalizada)": passo intermediário — em vez de A→Z,
  // o usuário define a ORDEM DOS RITMOS (poucos itens, ex.: 6-8), e o app
  // agrupa todas as músicas de cada ritmo juntas nessa sequência. Ordem
  // inicial = ordem de primeira aparição no setlist (não alfabética),
  // ponto de partida mais previsível do que reordenar do zero.
  const [ritmoPickerOpen, setRitmoPickerOpen] = useState(false)
  const [ritmoOrder, setRitmoOrder] = useState([])
  const normalizeRitmo = (ritmo) => (ritmo || '').trim().toLowerCase()
  const distinctRitmos = useMemo(() => {
    const seen = new Set()
    const order = []
    snapshotItems.forEach((it) => {
      const r = it.song?.ritmo?.trim()
      if (r && !seen.has(normalizeRitmo(r))) { seen.add(normalizeRitmo(r)); order.push(r) }
    })
    return order
  }, [snapshotItems])
  const openRitmoPicker = () => {
    setRitmoOrder(distinctRitmos)
    setRitmoPickerOpen(true)
  }
  const moveRitmo = (from, to) => setRitmoOrder((prev) => reorder(prev, from, to))
  const applyRitmoOrder = () => {
    setFormatId('ritmo_custom')
    const groups = groupByMedley(snapshotItems)
    const rank = new Map(ritmoOrder.map((r, i) => [normalizeRitmo(r), i]))
    const rankOf = (group) => rank.get(normalizeRitmo(group.members[0].song?.ritmo))
    setPreviewGroups([...groups].sort(compareBy(rankOf)))
    setRitmoPickerOpen(false)
  }

  // usado só pelo formato "nota do público" — busca leve, sem custo real
  // se o formato nunca for escolhido (relatório pode vir vazio à toa numa
  // setlist que nunca ativou feedback, sem problema).
  const { data: report } = useQuery({
    queryKey: ['feedback-report', setlistId],
    queryFn: () => api.get(`/setlists/${setlistId}/feedback/report`).then((r) => r.data),
  })
  const notaPublico = useMemo(() => {
    const map = {}
    ;(report || []).forEach((r) => { map[r.song_slug] = r.media })
    return map
  }, [report])

  const FORMATS = useMemo(() => [
    { id: 'random', label: t('orderRandom') },
    { id: 'titulo_asc', label: t('orderTitleAsc'), cmp: compareBy((it) => it.song?.titulo?.toLowerCase()) },
    { id: 'interprete_asc', label: t('orderArtistAsc'), cmp: compareBy((it) => it.song?.interprete?.toLowerCase()) },
    { id: 'ritmo_asc', label: t('orderRhythmAsc'), cmp: compareBy((it) => normalizeRitmo(it.song?.ritmo)) },
    { id: 'tom_chromatic', label: t('orderKeyChromatic'), cmp: compareBy((it) => keyIndex(it.song?.tom)) },
    { id: 'bpm_asc', label: t('orderBpmAsc'), cmp: compareBy((it) => it.song?.bpm) },
    { id: 'bpm_desc', label: t('orderBpmDesc'), cmp: compareBy((it) => it.song?.bpm, -1) },
    { id: 'velocidade_asc', label: t('orderSpeedAsc'), cmp: compareBy((it) => it.song?.velocidade) },
    { id: 'velocidade_desc', label: t('orderSpeedDesc'), cmp: compareBy((it) => it.song?.velocidade, -1) },
    { id: 'nota_publico_desc', label: t('orderAudienceRatingDesc'), cmp: compareBy((it) => notaPublico[it.song?.slug], -1) },
  ], [t, notaPublico])

  const applyFormat = (id) => {
    setFormatId(id)
    const groups = groupByMedley(snapshotItems)
    if (id === 'random') {
      setPreviewGroups(shuffle(groups))
      return
    }
    const fmt = FORMATS.find((f) => f.id === id)
    setPreviewGroups([...groups].sort((ga, gb) => fmt.cmp(ga.members[0], gb.members[0])))
  }

  const moveGroup = (from, to) => setPreviewGroups((prev) => reorder(prev, from, to))

  if (ritmoPickerOpen) {
    return (
      <Modal title={t('orderModalTitle')} onClose={onClose} maxWidth={480}>
        <p className="page-sub" style={{ marginTop: 0 }}>{t('ritmoOrderHint')}</p>
        <div style={{ maxHeight: '45vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {ritmoOrder.map((ritmo, i) => (
            <div key={ritmo} className="row"
              style={{ gap: 10, padding: '6px 10px', borderRadius: 8, background: 'var(--glass)', flexWrap: 'nowrap' }}>
              <span className="chip" style={{ minWidth: 22, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
              <div className="title" style={{ flex: 1 }}>{ritmo}</div>
              <div style={{ display: 'flex', gap: 2 }}>
                <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11 }}
                  disabled={i === 0} onClick={() => moveRitmo(i, i - 1)}>▲</button>
                <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11 }}
                  disabled={i === ritmoOrder.length - 1} onClick={() => moveRitmo(i, i + 1)}>▼</button>
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={() => setRitmoPickerOpen(false)}>{t('cancel')}</button>
          <button className="btn primary" onClick={applyRitmoOrder}>{t('applyRitmoOrder')}</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={t('orderModalTitle')} onClose={onClose} maxWidth={640}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {FORMATS.map((f) => (
          <button key={f.id} type="button" className={`btn${formatId === f.id ? ' primary' : ' ghost'}`}
            onClick={() => applyFormat(f.id)}>
            {f.label}
          </button>
        ))}
        <button type="button" className={`btn${formatId === 'ritmo_custom' ? ' primary' : ' ghost'}`}
          disabled={distinctRitmos.length < 2} title={distinctRitmos.length < 2 ? t('orderRhythmCustomDisabledHint') : undefined}
          onClick={openRitmoPicker}>
          {t('orderRhythmCustom')}
        </button>
      </div>

      <div style={{ maxHeight: '45vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {previewGroups.map((group, i) => (
          <div key={group.key} className="row"
            style={{ gap: 10, padding: '6px 10px', borderRadius: 8, background: 'var(--glass)', flexWrap: 'nowrap' }}>
            <span className="chip" style={{ minWidth: 22, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
            <div className="title" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {groupLabel(group.members)}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11 }}
                disabled={i === 0} onClick={() => moveGroup(i, i - 1)}>▲</button>
              <button type="button" className="btn ghost" style={{ padding: '1px 6px', fontSize: 11 }}
                disabled={i === previewGroups.length - 1} onClick={() => moveGroup(i, i + 1)}>▼</button>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" onClick={() => onApply(previewGroups.flatMap((g) => g.members))}>{t('applyOrder')}</button>
      </div>
    </Modal>
  )
}
