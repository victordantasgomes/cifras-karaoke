import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../services/api'
import ChordSheet from '../ChordSheet'

/** "Tocando agora" — inspirada na demo ao vivo da referência visual, mas
 * com música e cifra REAIS (não é mockup inventado, ver evidence rules do
 * plano): busca uma música pública qualquer via GET /public/songs e
 * renderiza o corpo de verdade com o mesmo ChordSheet.jsx usado no app —
 * a altura fixa em CSS (.landing-live-demo .landing-mockup-body) só recorta
 * a visualização, não trunca o dado. Reaproveita a mesma "chrome" visual
 * de app falso que Hero.jsx já usa (.landing-mockup), sem CSS novo pro
 * frame em si.
 *
 * `showTransport` (opcional, padrão false — usado por /main2 e /sobre2,
 * não muda o comportamento existente em /sobre): mostra uma fileira de
 * controles de transporte só decorativos (sempre `disabled`, nunca ligados
 * a reprodução de verdade), pra bater com o layout da referência. */
export default function LiveDemo({ showTransport = false }) {
  const { t } = useTranslation('landing')
  const { t: t2 } = useTranslation('landing2')

  const { data: picked } = useQuery({
    queryKey: ['landing-live-demo-pick'],
    queryFn: () => api.get('/public/songs', { params: { page_size: 1, sort: 'titulo' } }).then((r) => r.data.items[0]),
  })
  const { data: song } = useQuery({
    queryKey: ['landing-live-demo-song', picked?.slug],
    queryFn: () => api.get(`/public/songs/${picked.slug}`).then((r) => r.data),
    enabled: Boolean(picked?.slug),
  })

  return (
    <section id="tocando-agora">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('liveDemo.title')}</h2>
          <p className="landing-section-sub">{t('liveDemo.subtitle')}</p>
        </div>
        <div className="landing-live-demo">
          <div className="landing-mockup">
            <div className="landing-mockup-chrome">
              <span className="landing-mockup-dot" />
              <span className="landing-mockup-dot" />
              <span className="landing-mockup-dot" />
              <span className="landing-mockup-badge">{t('liveDemo.badge')}</span>
            </div>
            <div className="landing-mockup-body">
              {song ? (
                <>
                  <div className="landing-mockup-song">{song.titulo} — {song.header?.['intérprete'] || song.interprete}</div>
                  <ChordSheet body={song.body} />
                </>
              ) : (
                <div className="landing-mockup-song">{t('liveDemo.loading')}</div>
              )}
            </div>
            {showTransport && (
              <div className="landing-transport-row">
                <button type="button" className="landing-transport-btn" disabled aria-label={t2('shared.transportPrev')}>⏮</button>
                <button type="button" className="landing-transport-btn" disabled aria-label={t2('shared.transportPlay')}>▶</button>
                <button type="button" className="landing-transport-btn" disabled aria-label={t2('shared.transportNext')}>⏭</button>
                <button type="button" className="landing-transport-btn" disabled aria-label={t2('shared.transportDown')}>♭</button>
                <button type="button" className="landing-transport-btn" disabled aria-label={t2('shared.transportUp')}>♯</button>
                <button type="button" className="landing-transport-btn" disabled aria-label={t2('shared.transportZoomOut')}>−</button>
                <button type="button" className="landing-transport-btn" disabled aria-label={t2('shared.transportZoomIn')}>+</button>
              </div>
            )}
          </div>
          {song && (
            <div className="landing-live-demo-cta">
              <Link to={`/cifra/${song.slug}`} className="btn primary">{t('liveDemo.cta')}</Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
