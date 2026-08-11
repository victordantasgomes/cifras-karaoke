import { useTranslation } from 'react-i18next'

/** Faixa só de foto + texto, sem cards — entra entre "Recursos" e o
 * teaser do mural pra dar uma pausa visual e humanizar a página com uma
 * foto de músico de verdade (ver README em public/images/landing/). Sem
 * CTA próprio de propósito — o Hero e o Mural logo abaixo já carregam
 * os botões de ação da página. */
export default function CommunityBanner() {
  const { t } = useTranslation('landing')

  return (
    <section id="comunidade" className="landing-community">
      <div className="landing-container landing-community-inner">
        <img src="/images/landing/community.jpg" alt="" className="landing-community-photo" />
        <div className="landing-community-scrim">
          <span className="landing-eyebrow landing-community-eyebrow">{t('communityBanner.eyebrow')}</span>
          <h2 className="landing-community-title">{t('communityBanner.title')}</h2>
          <p className="landing-community-sub">{t('communityBanner.subtitle')}</p>
        </div>
      </div>
    </section>
  )
}
