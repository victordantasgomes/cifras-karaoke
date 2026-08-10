import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import logo from '../assets/logo-horizontal.png'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import ThemeToggle from '../components/ThemeToggle'
import { useCurrentTheme } from '../hooks/useTheme'
import '../styles/landing.css'

const SKILL_LEVELS = ['iniciante', 'intermediario', 'avancado', 'profissional']
const GOALS = ['hobby', 'ensaios_regulares', 'shows_pagos', 'gravacao']

const EMPTY_FORM = {
  band_name: '', genero: '', style_freeform: '', skill_level: '', goal: '',
  rehearsal_days: '', instruments_needed: '', bio: '', contact_info: '', setlist_refs: [],
}

function toFormState(post) {
  return {
    band_name: post.band_name, genero: post.genero, style_freeform: post.style_freeform,
    skill_level: post.skill_level, goal: post.goal,
    rehearsal_days: post.rehearsal_days.join(', '), instruments_needed: post.instruments_needed.join(', '),
    bio: post.bio, contact_info: post.contact_info, setlist_refs: post.setlist_refs,
  }
}

function toPayload(form) {
  return {
    ...form,
    rehearsal_days: form.rehearsal_days.split(',').map((s) => s.trim()).filter(Boolean),
    instruments_needed: form.instruments_needed.split(',').map((s) => s.trim()).filter(Boolean),
  }
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
  const [form, setForm] = useState(initial ? toFormState(initial) : EMPTY_FORM)
  const [error, setError] = useState('')
  const isEdit = Boolean(initial)

  const { data: mySetlists } = useQuery({
    queryKey: ['setlists'],
    queryFn: () => api.get('/setlists').then((r) => r.data),
  })

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

  return (
    <div className="card no-print" style={{ marginBottom: 18 }}>
      <h3 style={{ marginBottom: 14 }}>{t(isEdit ? 'form.editTitle' : 'form.createTitle')}</h3>
      <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label>{t('form.bandName')}</label>
          <input className="input" value={form.band_name} onChange={(e) => setForm({ ...form, band_name: e.target.value })} />
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
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label>{t('form.rehearsalDays')}</label>
          <input className="input" placeholder={t('form.rehearsalDaysPlaceholder')}
            value={form.rehearsal_days} onChange={(e) => setForm({ ...form, rehearsal_days: e.target.value })} />
        </div>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label>{t('form.instrumentsNeeded')}</label>
          <input className="input" placeholder={t('form.instrumentsPlaceholder')}
            value={form.instruments_needed} onChange={(e) => setForm({ ...form, instruments_needed: e.target.value })} />
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
      {mySetlists?.filter((s) => s.is_owner).length > 0 && (
        <div className="field" style={{ marginBottom: 0 }}>
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

function PostCard({ post, mine, t, onEdit }) {
  const qc = useQueryClient()
  const toggleActive = useMutation({
    mutationFn: () => api.post(`/band-board/${post.id}/active`, { value: !post.active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['band-board'] })
      qc.invalidateQueries({ queryKey: ['band-board-mine'] })
    },
  })

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
        {[post.genero, post.style_freeform].filter(Boolean).join(' · ')}
        {post.skill_level && <> · {t(`form.skillLevels.${post.skill_level}`)}</>}
        {post.goal && <> · {t(`form.goals.${post.goal}`)}</>}
      </div>
      {post.bio && <p style={{ marginBottom: 10 }}>{post.bio}</p>}
      {post.instruments_needed.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <strong>{t('card.instrumentsNeeded')}</strong> {post.instruments_needed.join(', ')}
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
