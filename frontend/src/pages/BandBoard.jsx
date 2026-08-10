import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import logo from '../assets/logo-horizontal.png'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import ThemeToggle from '../components/ThemeToggle'
import { useCurrentTheme } from '../hooks/useTheme'
import { INSTRUMENTS } from '../utils/instruments'
import '../styles/landing.css'

const SKILL_LEVELS = ['iniciante', 'intermediario', 'avancado', 'profissional']
const GOALS = ['hobby', 'ensaios_regulares', 'shows_pagos', 'gravacao']

const EMPTY_FORM = {
  band_name: '', city: '', genero: '', style_freeform: '', skill_level: '', goal: '',
  rehearsal_days: '', instruments_needed: [], bio: '', contact_info: '', setlist_refs: [],
}

function toFormState(post) {
  return {
    band_name: post.band_name, city: post.city, genero: post.genero, style_freeform: post.style_freeform,
    skill_level: post.skill_level, goal: post.goal,
    rehearsal_days: post.rehearsal_days.join(', '), instruments_needed: post.instruments_needed,
    bio: post.bio, contact_info: post.contact_info, setlist_refs: post.setlist_refs,
  }
}

function toPayload(form) {
  return {
    ...form,
    rehearsal_days: form.rehearsal_days.split(',').map((s) => s.trim()).filter(Boolean),
  }
}

// aceita youtube.com/watch?v=, youtu.be/, youtube.com/embed/, com ou sem
// parâmetros extras (ex.: playlist, timestamp) — usado só pro embed do
// card público, a URL crua é sempre o que fica salvo.
function extractYoutubeId(url) {
  const match = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/,
  )
  return match ? match[1] : null
}

const MEDIA_FILE_KINDS = ['photo', 'video']
const MEDIA_LINK_KINDS = ['link', 'youtube']

function MediaSlot({ t, postId, kind, onChanged }) {
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const isFileKind = MEDIA_FILE_KINDS.includes(kind)

  const add = useMutation({
    mutationFn: () => {
      if (isFileKind) {
        const fd = new FormData()
        fd.append('kind', kind)
        fd.append('file', file)
        fd.append('label', label)
        return api.post(`/band-board/${postId}/media`, fd)
      }
      return api.post(`/band-board/${postId}/media/link`, { kind, url, label })
    },
    onSuccess: () => { setFile(null); setUrl(''); setLabel(''); setError(''); onChanged() },
    onError: (e) => setError(e.response?.data?.error || t('media.errors.add')),
  })

  return (
    <div style={{ flex: '1 1 220px', border: '1px solid var(--stroke)', borderRadius: 8, padding: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t(`media.kinds.${kind}`)}</div>
      {isFileKind ? (
        <input className="input" type="file" accept={kind === 'photo' ? 'image/*' : 'video/*'}
          onChange={(e) => setFile(e.target.files[0])} />
      ) : (
        <input className="input" placeholder={kind === 'youtube' ? t('media.youtubePlaceholder') : t('media.linkPlaceholder')}
          value={url} onChange={(e) => setUrl(e.target.value)} />
      )}
      <input className="input" placeholder={t('media.labelPlaceholder')} value={label}
        onChange={(e) => setLabel(e.target.value)} style={{ marginTop: 6 }} />
      <button className="btn" style={{ marginTop: 6, width: '100%' }}
        disabled={(isFileKind ? !file : !url.trim()) || add.isPending}
        onClick={() => add.mutate()}>
        {add.isPending ? t('media.attaching') : t('media.attach')}
      </button>
      {error && <div className="error-text" style={{ marginTop: 6, fontSize: 12 }}>{error}</div>}
    </div>
  )
}

function MediaGalleryEditor({ t, postId, media, onChanged }) {
  const remove = useMutation({
    mutationFn: (mediaId) => api.delete(`/band-board/${postId}/media/${mediaId}`),
    onSuccess: onChanged,
  })

  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{t('media.title')}</label>
      {media.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
          {media.map((m) => (
            <div key={m.id} style={{ border: '1px solid var(--stroke)', borderRadius: 8, padding: 8 }}>
              {m.kind === 'photo' && (
                <img src={`/api/band-board/${postId}/media/${m.id}/file`} alt={m.label}
                  style={{ width: '100%', height: 84, objectFit: 'cover', borderRadius: 6 }} />
              )}
              {m.kind === 'video' && (
                <video src={`/api/band-board/${postId}/media/${m.id}/file`} controls
                  style={{ width: '100%', height: 84, borderRadius: 6 }} />
              )}
              {(m.kind === 'link' || m.kind === 'youtube') && (
                <div style={{ height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                  {m.kind === 'youtube' ? '▶' : '🔗'}
                </div>
              )}
              <div style={{ fontSize: 12, marginTop: 6, wordBreak: 'break-word' }}>
                {m.label || t(`media.kinds.${m.kind}`)}
              </div>
              <button className="btn danger" style={{ marginTop: 6, width: '100%', fontSize: 12, padding: '4px 6px' }}
                disabled={remove.isPending} onClick={() => remove.mutate(m.id)}>
                {t('media.remove')}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        {[...MEDIA_FILE_KINDS, ...MEDIA_LINK_KINDS].map((kind) => (
          <MediaSlot key={kind} t={t} postId={postId} kind={kind} onChanged={onChanged} />
        ))}
      </div>
    </div>
  )
}

/** Badge com a marca do autor (Fase 8) — logo/nome se configurados, senão nada. */
function AuthorBadge({ userId }) {
  const theme = useCurrentTheme()
  const { data } = useQuery({
    queryKey: ['branding-info', userId],
    queryFn: () => api.get(`/branding/${userId}`).then((r) => r.data),
    staleTime: Infinity,
  })
  if (!data?.has_logo && !data?.band_name) return null
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
      {data.has_logo && <img src={`/api/branding/${userId}/logo?theme=${theme}`} alt="" style={{ height: 28, borderRadius: 6 }} />}
      {data.band_name && <strong>{data.band_name}</strong>}
    </div>
  )
}

function PostForm({ initial, onDone, t }) {
  const qc = useQueryClient()
  const { t: ti } = useTranslation('instruments')
  const [form, setForm] = useState(initial ? toFormState(initial) : EMPTY_FORM)
  const [error, setError] = useState('')
  const isEdit = Boolean(initial)

  const { data: mySetlists } = useQuery({
    queryKey: ['setlists'],
    queryFn: () => api.get('/setlists').then((r) => r.data),
  })
  // mesma query-key da lista "Meus anúncios" (BandBoard abaixo) — react-query
  // compartilha o cache, então isso não dispara uma chamada extra depois da
  // primeira montagem, e a mídia mostrada aqui sempre reflete o que já foi
  // anexado/removido nesta sessão de edição (o `initial` recebido do pai é
  // só a foto tirada no momento em que o usuário clicou em "Editar").
  const { data: myPosts } = useQuery({
    queryKey: ['band-board-mine'],
    queryFn: () => api.get('/band-board/mine').then((r) => r.data),
    enabled: isEdit,
  })
  const media = (isEdit && myPosts?.find((p) => p.id === initial.id)?.media) || []

  const save = useMutation({
    mutationFn: () => (isEdit
      ? api.put(`/band-board/${initial.id}`, toPayload(form))
      : api.post('/band-board', toPayload(form))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['band-board'] })
      qc.invalidateQueries({ queryKey: ['band-board-mine'] })
      onDone()
    },
    onError: (e) => setError(e.response?.data?.error || t(isEdit ? 'errors.update' : 'errors.create')),
  })

  const toggleSetlist = (id) => {
    setForm((f) => ({
      ...f,
      setlist_refs: f.setlist_refs.includes(id) ? f.setlist_refs.filter((s) => s !== id) : [...f.setlist_refs, id],
    }))
  }

  const toggleInstrument = (id) => {
    setForm((f) => ({
      ...f,
      instruments_needed: f.instruments_needed.includes(id)
        ? f.instruments_needed.filter((s) => s !== id) : [...f.instruments_needed, id],
    }))
  }

  return (
    <div className="card no-print" style={{ marginBottom: 18 }}>
      <h3 style={{ marginBottom: 14 }}>{t(isEdit ? 'form.editTitle' : 'form.createTitle')}</h3>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label>{t('form.bandName')}</label>
          <input className="input" value={form.band_name} onChange={(e) => setForm({ ...form, band_name: e.target.value })} />
        </div>
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label>{t('form.city')}</label>
          <input className="input" placeholder={t('form.cityPlaceholder')}
            value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label>{t('form.genero')}</label>
          <input className="input" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })} />
        </div>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label>{t('form.style')}</label>
          <input className="input" value={form.style_freeform} onChange={(e) => setForm({ ...form, style_freeform: e.target.value })} />
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label>{t('form.skillLevel')}</label>
          <select className="input" value={form.skill_level} onChange={(e) => setForm({ ...form, skill_level: e.target.value })}>
            <option value="">{t('form.skillLevelPlaceholder')}</option>
            {SKILL_LEVELS.map((s) => <option key={s} value={s}>{t(`form.skillLevels.${s}`)}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label>{t('form.goal')}</label>
          <select className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
            <option value="">{t('form.goalPlaceholder')}</option>
            {GOALS.map((g) => <option key={g} value={g}>{t(`form.goals.${g}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="field" style={{ flex: '1 1 220px', marginBottom: 0 }}>
          <label>{t('form.rehearsalDays')}</label>
          <input className="input" placeholder={t('form.rehearsalDaysPlaceholder')}
            value={form.rehearsal_days} onChange={(e) => setForm({ ...form, rehearsal_days: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>{t('form.instrumentsNeeded')}</label>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {INSTRUMENTS.map((id) => (
            <label key={id} className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.instruments_needed.includes(id)}
                onChange={() => toggleInstrument(id)} />
              {ti(`names.${id}`)}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{t('form.bio')}</label>
        <textarea className="input" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      </div>
      <div className="field">
        <label>{t('form.contactInfo')}</label>
        <input className="input" placeholder={t('form.contactPlaceholder')}
          value={form.contact_info} onChange={(e) => setForm({ ...form, contact_info: e.target.value })} />
      </div>
      {isEdit ? (
        <MediaGalleryEditor t={t} postId={initial.id} media={media}
          onChanged={() => qc.invalidateQueries({ queryKey: ['band-board-mine'] })} />
      ) : (
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>{t('media.saveFirst')}</p>
      )}
      {mySetlists?.filter((s) => s.is_owner).length > 0 && (
        <div className="field" style={{ marginBottom: 0, marginTop: 14 }}>
          <label>{t('form.linkSetlists')}</label>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            {mySetlists.filter((s) => s.is_owner).map((s) => (
              <label key={s.id} className="row" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.setlist_refs.includes(s.id)}
                  onChange={() => toggleSetlist(s.id)} />
                {s.nome}
              </label>
            ))}
          </div>
        </div>
      )}
      {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('form.saving') : t(isEdit ? 'form.saveChanges' : 'form.submit')}
        </button>
        <button className="btn" onClick={onDone}>{t('form.cancel')}</button>
      </div>
    </div>
  )
}

function PostMediaGallery({ post, t }) {
  const photos = post.media.filter((m) => m.kind === 'photo')
  const videos = post.media.filter((m) => m.kind === 'video')
  const youtube = post.media.filter((m) => m.kind === 'youtube')
  const links = post.media.filter((m) => m.kind === 'link')
  if (!post.media.length) return null

  return (
    <div style={{ marginBottom: 10 }}>
      {(photos.length > 0 || videos.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: links.length || youtube.length ? 10 : 0 }}>
          {photos.map((m) => (
            <img key={m.id} src={`/api/band-board/${post.id}/media/${m.id}/file`} alt={m.label}
              style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8 }} />
          ))}
          {videos.map((m) => (
            <video key={m.id} src={`/api/band-board/${post.id}/media/${m.id}/file`} controls
              style={{ width: '100%', height: 110, borderRadius: 8 }} />
          ))}
        </div>
      )}
      {youtube.map((m) => {
        const videoId = extractYoutubeId(m.url)
        return videoId ? (
          <div key={m.id} style={{ position: 'relative', paddingTop: '56.25%', marginBottom: 10, borderRadius: 8, overflow: 'hidden' }}>
            <iframe src={`https://www.youtube.com/embed/${videoId}`} title={m.label || 'YouTube'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen frameBorder="0"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
        ) : (
          <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="btn" style={{ marginRight: 8, marginBottom: 8 }}>
            ▶ {m.label || t('media.kinds.youtube')}
          </a>
        )
      })}
      {links.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {links.map((m) => (
            <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="btn">
              🔗 {m.label || m.url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({ post, mine, t, onEdit }) {
  const qc = useQueryClient()
  const { t: ti } = useTranslation('instruments')
  const toggleActive = useMutation({
    mutationFn: () => api.post(`/band-board/${post.id}/active`, { value: !post.active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['band-board'] })
      qc.invalidateQueries({ queryKey: ['band-board-mine'] })
    },
  })
  // anúncios antigos (de antes da Fase de alertas) tinham texto livre aqui
  // — filtra o que não bate mais com o vocabulário fechado em vez de
  // mostrar a chave de tradução crua.
  const knownInstruments = post.instruments_needed.filter((id) => INSTRUMENTS.includes(id))

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <AuthorBadge userId={post.user_id} />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ marginBottom: 4 }}>
          {post.band_name}
          {!post.active && <span className="chip" style={{ marginLeft: 8 }}>{t('inactiveBadge')}</span>}
        </h3>
      </div>
      <div className="page-sub" style={{ marginBottom: 10 }}>
        {[post.city, post.genero, post.style_freeform].filter(Boolean).join(' · ')}
        {post.skill_level && <> · {t(`form.skillLevels.${post.skill_level}`)}</>}
        {post.goal && <> · {t(`form.goals.${post.goal}`)}</>}
      </div>
      {post.bio && <p style={{ marginBottom: 10 }}>{post.bio}</p>}
      <PostMediaGallery post={post} t={t} />
      {knownInstruments.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <strong>{t('card.instrumentsNeeded')}</strong>
          {knownInstruments.map((id) => <span key={id} className="chip">{ti(`names.${id}`)}</span>)}
        </div>
      )}
      {post.rehearsal_days.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <strong>{t('card.rehearsalDays')}</strong> {post.rehearsal_days.join(', ')}
        </div>
      )}
      {post.contact_info && (
        <div style={{ marginBottom: 10 }}>
          <strong>{t('card.contact')}</strong> {post.contact_info}
        </div>
      )}
      {mine && (
        <div className="row">
          <button className="btn" onClick={() => onEdit(post)}>{t('card.edit')}</button>
          <button className="btn" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate()}>
            {post.active ? t('card.deactivate') : t('card.activate')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function BandBoard() {
  const { t } = useTranslation('bandBoard')
  const token = useAuthStore((s) => s.token)
  const [showForm, setShowForm] = useState(false)
  const [editingPost, setEditingPost] = useState(null)

  const { data: posts } = useQuery({ queryKey: ['band-board'], queryFn: () => api.get('/band-board').then((r) => r.data) })
  const { data: myPosts } = useQuery({
    queryKey: ['band-board-mine'],
    queryFn: () => api.get('/band-board/mine').then((r) => r.data),
    enabled: Boolean(token),
  })

  const closeForm = () => { setShowForm(false); setEditingPost(null) }
  const openEdit = (post) => { setEditingPost(post); setShowForm(true) }

  return (
    <div className="landing-page">
      <header className="landing-header no-print">
        <img src={logo} alt="Cifras Karaokê" className="landing-logo" />
        <div className="landing-header-actions">
          <ThemeToggle />
          {token ? (
            <Link to="/painel" className="btn">{t('backToApp')}</Link>
          ) : (
            <>
              <Link to="/login" className="btn ghost">{t('login')}</Link>
              <Link to="/cadastro" className="btn primary">{t('signup')}</Link>
            </>
          )}
        </div>
      </header>

      <main className="landing-container" style={{ paddingTop: 108, paddingBottom: 60, paddingLeft: '6vw', paddingRight: '6vw' }}>
        <div className="row no-print" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 className="page-title">{t('title')}</h1>
            <div className="page-sub">{t('subtitle')}</div>
          </div>
          <button className="btn primary" onClick={() => (token ? setShowForm(!showForm) : (window.location.href = '/login'))}>
            {t('newPost')}
          </button>
        </div>

        {showForm && !editingPost && <PostForm t={t} onDone={closeForm} />}

        {token && myPosts?.length > 0 && (
          <>
            <h2 style={{ marginBottom: 12 }}>{t('myPosts')}</h2>
            {editingPost && <PostForm t={t} initial={editingPost} onDone={closeForm} />}
            {myPosts.map((p) => <PostCard key={p.id} post={p} mine t={t} onEdit={openEdit} />)}
          </>
        )}
        {token && myPosts?.length === 0 && !showForm && (
          <div className="empty" style={{ marginBottom: 20 }}>{t('emptyMine')}</div>
        )}

        <h2 style={{ margin: '28px 0 12px' }}>{t('title')}</h2>
        {!posts?.length && <div className="empty">{t('empty')}</div>}
        {posts?.map((p) => <PostCard key={p.id} post={p} mine={false} t={t} />)}
      </main>
    </div>
  )
}
