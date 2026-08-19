import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import ChordSheet from '../components/ChordSheet'
import PublicHeader from '../components/PublicHeader'
import { useAuthGate } from '../components/AuthGate'
import { usePublicSong, exportPublicSongTxt } from '../hooks/usePublicSong'
import '../styles/landing.css'

const KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']

/**
 * Cifra individual pública (`/cifra/:slug`) — sem login. NÃO é uma extração
 * de SongEditor.jsx: a toolbar de lá está toda amarrada a mutations do
 * componente inteiro (favoritar/normalizar/avaliar/clonar/compartilhar/
 * excluir/editar), então este componente é novo e enxuto, reaproveitando só
 * o ChordSheet e replicando localmente as poucas ações que fazem sentido
 * sem dono: karaokê, imprimir, exportar TXT, e transpor. Busca/transpõe via
 * usePublicSong.js. Favoritar abre o gate de cadastro.
 */
export default function PublicSongView() {
  const { t } = useTranslation('publicHome')
  const { t: tEditor } = useTranslation('songEditor')
  const { slug } = useParams()
  const navigate = useNavigate()
  const { requireAuth, modal } = useAuthGate()
  const { data, isLoading, isError, header: previewHeader, body: previewBody, transpose } = usePublicSong(slug)

  if (isLoading) return <div className="empty">{tEditor('loading')}</div>
  if (isError || !data) {
    return (
      <div className="landing-page">
        <PublicHeader />
        <main className="landing-container" style={{ paddingTop: 108, paddingLeft: '6vw', paddingRight: '6vw' }}>
          <div className="empty">{t('songNotFound')}</div>
          <div className="page-sub">{t('songNotFoundHint')}</div>
          <Link to="/" className="btn" style={{ marginTop: 12, display: 'inline-block' }}>{t('backToHome')}</Link>
        </main>
      </div>
    )
  }

  const header = previewHeader || data.header
  const body = previewBody || data.body

  return (
    <div className="landing-page">
      <PublicHeader />
      <main className="landing-container" style={{ paddingTop: 108, paddingBottom: 60, paddingLeft: '6vw', paddingRight: '6vw' }}>
        <div className="row no-print" style={{ justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title">{header.titulo || data.titulo}</h1>
            <div className="page-sub">
              {header['intérprete']} {header.tom && <>· <span className="chip">{header.tom}</span></>}
            </div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => navigate(`/karaoke/${slug}`)}>{tEditor('actions.karaoke')}</button>
            <button className="btn" onClick={() => requireAuth('favorite', () => {})}>{tEditor('actions.favorite')}</button>
            <button className="btn" onClick={() => window.print()}>{tEditor('actions.print')}</button>
            <a className="btn" href={`${api.defaults.baseURL}/public/songs/${slug}/export`}
              onClick={(e) => { e.preventDefault(); exportPublicSongTxt(slug, header.titulo) }}>{tEditor('actions.exportTxt')}</a>
          </div>
        </div>

        <div className="row no-print" style={{ margin: '14px 0' }}>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{tEditor('tabs.transpose')}</span>
          <button className="btn" onClick={() => transpose.mutate({ semitones: -1 })}>{tEditor('tabs.downHalf')}</button>
          <button className="btn" onClick={() => transpose.mutate({ semitones: 1 })}>{tEditor('tabs.upHalf')}</button>
          <select className="input" style={{ width: 120 }} value=""
            onChange={(e) => e.target.value && transpose.mutate({ to_key: e.target.value })}>
            <option value="">{tEditor('tabs.toKey')}</option>
            {KEYS.map((k) => <option key={k}>{k}</option>)}
          </select>
        </div>

        <div className="card"><ChordSheet body={body} /></div>
      </main>
      {modal}
    </div>
  )
}
