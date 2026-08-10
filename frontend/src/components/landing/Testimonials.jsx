import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const COUNT = 5
const AUTO_MS = 6000

/** Carrossel simples (state próprio, sem lib externa) — troca automática
 * a cada 6s, pausando qualquer temporizador anterior a cada navegação
 * manual pra não "brigar" com o clique do usuário. Depoimentos são
 * conteúdo de exemplo, claramente fictício (ver landing.json::testimonials). */
export default function Testimonials() {
  const { t } = useTranslation('landing')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % COUNT), AUTO_MS)
    return () => clearInterval(id)
  }, [index])

  const items = Array.from({ length: COUNT }, (_, i) => i + 1).map((n) => ({
    n,
    quote: t(`testimonials.item${n}Quote`),
    name: t(`testimonials.item${n}Name`),
    role: t(`testimonials.item${n}Role`),
  }))
  const current = items[index]

  return (
    <section id="depoimentos">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">{t('testimonials.title')}</h2>
          <p className="landing-section-sub">{t('testimonials.subtitle')}</p>
        </div>
        <div className="landing-testimonials-wrap">
          <button
            className="landing-carousel-btn"
            aria-label={t('testimonials.prevLabel')}
            onClick={() => setIndex((i) => (i - 1 + COUNT) % COUNT)}
          >‹</button>
          <div className="card landing-testimonial-card">
            <p className="landing-testimonial-quote">{current.quote}</p>
            <div className="landing-testimonial-name">{current.name}</div>
            <div className="landing-testimonial-role">{current.role}</div>
          </div>
          <button
            className="landing-carousel-btn"
            aria-label={t('testimonials.nextLabel')}
            onClick={() => setIndex((i) => (i + 1) % COUNT)}
          >›</button>
        </div>
        <div className="landing-carousel-dots">
          {items.map((it, i) => (
            <button
              key={it.n}
              className={`landing-carousel-dot${i === index ? ' active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={it.name}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
