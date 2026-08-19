import Header2 from '../components/landing2/Header2'
import Hero2 from '../components/landing2/Hero2'
import Explore from '../components/landing/Explore'
import LiveDemo from '../components/landing/LiveDemo'
import Library2 from '../components/landing2/Library2'
import BeforeAfter from '../components/landing/BeforeAfter'
import SetlistShowcase from '../components/landing/SetlistShowcase'
import OneScreenStats from '../components/landing2/OneScreenStats'
import PricingSection from '../components/landing/PricingSection'
import Footer2 from '../components/landing2/Footer2'
import '../styles/landing.css'
import '../styles/landing2.css'

/**
 * /sobre2 — réplica do layout/conteúdo da mesma referência "Central
 * Musical" que Main2.jsx, ver comentário lá. Hoje com o mesmo conteúdo de
 * Main2.jsx (só o conceito "Central Musical" da referência está acessível
 * de verdade, ver plano) — pronto pra divergir depois via os locales de
 * landing2.json (chaves sobre2), sem reescrever componente.
 */
export default function Sobre2() {
  return (
    <div className="landing-page">
      <Header2 page="sobre2" />
      <main>
        <Hero2 page="sobre2" />
        <Explore />
        <LiveDemo showTransport />
        <Library2 page="sobre2" />
        <BeforeAfter />
        <SetlistShowcase showHeader />
        <OneScreenStats page="sobre2" />
        <PricingSection />
      </main>
      <Footer2 page="sobre2" />
    </div>
  )
}
