import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { PostForm, PostCard } from '../components/bandBoardShared'

/** Gestão dos PRÓPRIOS anúncios do mural — dentro do shell autenticado
 * (ver Layout.jsx/Sidebar.jsx), diferente da vitrine pública em
 * BandBoard.jsx (fora da sidebar, qualquer visitante navega). */
export default function BandBoardManage() {
  const { t } = useTranslation('bandBoard')
  const [showForm, setShowForm] = useState(false)
  const [editingPost, setEditingPost] = useState(null)

  const { data: myPosts } = useQuery({
    queryKey: ['band-board-mine'],
    queryFn: () => api.get('/band-board/mine').then((r) => r.data),
  })

  const closeForm = () => { setShowForm(false); setEditingPost(null) }
  const openEdit = (post) => { setEditingPost(post); setShowForm(true) }

  return (
    <>
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">{t('myPosts')}</h1>
          <div className="page-sub">{t('manage.subtitle')}</div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link to="/mural" className="btn">{t('manage.viewPublic')}</Link>
          <button className="btn primary" onClick={() => setShowForm(!showForm)}>{t('newPost')}</button>
        </div>
      </div>

      {showForm && !editingPost && <PostForm t={t} onDone={closeForm} />}

      {myPosts?.length > 0 && (
        <>
          {editingPost && <PostForm t={t} initial={editingPost} onDone={closeForm} />}
          {myPosts.map((p) => <PostCard key={p.id} post={p} mine t={t} onEdit={openEdit} />)}
        </>
      )}
      {myPosts?.length === 0 && !showForm && (
        <div className="empty">{t('emptyMine')}</div>
      )}
    </>
  )
}
