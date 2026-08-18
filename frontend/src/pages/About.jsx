import { useEffect } from 'react'
import { useForceLightTheme } from '../hooks/useTheme'
import api from '../services/api'
import LandingHeader from '../components/landing/LandingHeader'
import Hero from '../components/landing/Hero'
import Journey from '../components/landing/Journey'
import HowItWorks from '../components/landing/HowItWorks'
import Capabilities from '../components/landing/Capabilities'
import CommunityBanner from '../components/landing/CommunityBanner'
import BandBoardTeaser from '../components/landing/BandBoardTeaser'
import Integrations from '../components/landing/Integrations'
import Comparison from '../components/landing/Comparison'
import Testimonials from '../components/landing/Testimonials'
import PricingSection from '../components/landing/PricingSection'
import Faq from '../components/landing/Faq'
import LandingFooter from '../components/landing/LandingFooter'
import '../styles/landing.css'

/**
 * Página de vendas ("Sobre"/planos) — marketing, sem <Layout> (sem
 * sidebar/app-shell), sempre em tema claro independente da preferência
 * salva do visitante (ver useForceLightTheme). Antes vivia em `/` (ver
 * Landing.jsx original); agora `/` é a página principal funcional
 * (PublicHome.jsx) e esta seção de vendas mora em `/sobre`. Conteúdo
 * inalterado nesta mudança — só o local que renderiza mudou. Diferente da
 * Landing.jsx original, não redireciona usuário logado: não há razão pra
 * bloquear quem já tem conta de ver planos/FAQ aqui.
 */
export default function About() {
  useForceLightTheme()

  useEffect(() => {
    api.post('/telemetry/landing-view').catch(() => {})
  }, [])

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="landing-page">
      <LandingHeader onNavigate={scrollToSection} />
      <main>
        <Hero />
        <Journey />
        <HowItWorks />
        <Capabilities />
        <CommunityBanner />
        <BandBoardTeaser />
        <Integrations />
        <Comparison />
        <Testimonials />
        <PricingSection />
        <Faq />
      </main>
      <LandingFooter onNavigate={scrollToSection} />
    </div>
  )
}
