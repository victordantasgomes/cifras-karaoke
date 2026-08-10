import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../services/api'

/** Vitrine pública dos anúncios do mural (/mural, já 100% público) — só não
 * era alcançável a partir da landing de marketing até aqui. Mostra os 3
 * anúncios ativos mais recentes, sem exigir login (mesma rota pública
 * consumida por BandBoard.jsx). */
export default function BandBoardTeaser() {
  const { t } = useTranslation('landing')
  const { data: posts } = useQuery({
    queryKey: ['band-board'],
    queryFn: () => api.get('/band-board').then((r) => r.data),
  })
  const preview = (posts || []).slice(0, 3)
  const firstPhoto = (post) => post.media?.find((m) => m.kind === 'photo')

  return (
    <section id="mural">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('bandBoardTeaser.title')}</h2>
          <p className="landing-section-sub">{t('bandBoardTeaser.subtitle')}</p>
        </div>
        {preview.length === 0 ? (
          <p className="landing-section-sub" style={{ textAlign: 'center' }}>{t('bandBoardTeaser.empty')}</p>
        ) : (
          <div className="landing-capabilities-grid">
            {preview.map((post) => {
              const photo = firstPhoto(post)
              return (
                <div key={post.id} className="card landing-capability-card">
                  {photo && (
                    <img src={`/api/band-board/${post.id}/media/${photo.id}/file`} alt=""
                      style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }} />
                  )}
                  <h3>{post.band_name}</h3>
                  <p>{[post.city, post.genero].filter(Boolean).join(' · ')}</p>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <Link to="/mural" className="btn primary">{t('bandBoardTeaser.cta')}</Link>
        </div>
      </div>
    </section>
  )
}
