import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useForceLightTheme } from '../hooks/useTheme'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'
import LandingHeader from '../components/landing/LandingHeader'
import Hero from '../components/landing/Hero'
import Journey from '../components/landing/Journey'
import HowItWorks from '../components/landing/HowItWorks'
import Capabilities from '../components/landing/Capabilities'
import BandBoardTeaser from '../components/landing/BandBoardTeaser'
import Integrations from '../components/landing/Integrations'
import Comparison from '../components/landing/Comparison'
import Testimonials from '../components/landing/Testimonials'
import PricingSection from '../components/landing/PricingSection'
import Faq from '../components/landing/Faq'
import LandingFooter from '../components/landing/LandingFooter'
import '../styles/landing.css'

/**
 * Landing page pública (Fase 5) — marketing, sem <Layout> (sem
 * sidebar/app-shell), sempre em tema claro independente da preferência
 * salva do visitante (ver useForceLightTheme). Usuário já logado é
 * redirecionado direto pro painel, mesmo padrão inverso de Layout.jsx.
 */
export default function Landing() {
  useForceLightTheme()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    api.post('/telemetry/landing-view').catch(() => {})
  }, [])

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (token) return <Navigate to="/painel" replace />

  return (
    <div className="landing-page">
      <LandingHeader onNavigate={scrollToSection} />
      <main>
        <Hero />
        <Journey />
        <HowItWorks />
        <Capabilities />
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
