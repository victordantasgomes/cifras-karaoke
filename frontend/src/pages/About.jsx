import { useEffect } from 'react'
import { useForceLightTheme } from '../hooks/useTheme'
import api from '../services/api'
import LandingHeader from '../components/landing/LandingHeader'
import Hero from '../components/landing/Hero'
import Explore from '../components/landing/Explore'
import LiveDemo from '../components/landing/LiveDemo'
import Journey from '../components/landing/Journey'
import BeforeAfter from '../components/landing/BeforeAfter'
import HowItWorks from '../components/landing/HowItWorks'
import Capabilities from '../components/landing/Capabilities'
import SetlistShowcase from '../components/landing/SetlistShowcase'
import CommunityBanner from '../components/landing/CommunityBanner'
import BandBoardTeaser from '../components/landing/BandBoardTeaser'
import Integrations from '../components/landing/Integrations'
import Comparison from '../components/landing/Comparison'
import PricingSection from '../components/landing/PricingSection'
import Faq from '../components/landing/Faq'
import LandingFooter from '../components/landing/LandingFooter'
import '../styles/landing.css'

/**
 * Página de vendas — marketing, sem <Layout> (sem sidebar/app-shell),
 * sempre em tema claro independente da preferência salva do visitante (ver
 * useForceLightTheme). Página principal da aplicação, em `/`. Diferente da
 * Landing.jsx original, não redireciona usuário logado: não há razão pra
 * bloquear quem já tem conta de ver planos/FAQ aqui.
 *
 * Estrutura/seções reordenadas e ampliadas (Explore/LiveDemo/BeforeAfter/
 * SetlistShowcase são novas) inspiradas numa referência visual externa,
 * mantendo tudo real/verificável: LiveDemo mostra uma cifra de verdade da
 * biblioteca pública, BeforeAfter demonstra a formatação real via
 * ChordSheet, Capabilities/PricingSection continuam com dado real. A seção
 * de depoimentos (Testimonials) foi removida — era conteúdo explicitamente
 * fictício (ver comentário no próprio arquivo), a referência também não
 * tem seção de prova social.
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
        <Explore />
        <LiveDemo />
        <Journey />
        <BeforeAfter />
        <HowItWorks />
        <Capabilities />
        <SetlistShowcase />
        <CommunityBanner />
        <BandBoardTeaser />
        <Integrations />
        <Comparison />
        <PricingSection />
        <Faq />
      </main>
      <LandingFooter onNavigate={scrollToSection} />
    </div>
  )
}
