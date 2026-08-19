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
 * /main2 — réplica do layout/conteúdo da referência "Central Musical"
 * (ver plano). Casca fina: monta as seções na mesma ordem da referência,
 * a maioria reaproveitada de components/landing/ (já construídas na
 * rodada anterior), algumas novas em components/landing2/. Não força tema
 * claro (o padrão do app já é a paleta ink/paper da referência) e não
 * dispara telemetria ainda (rota experimental).
 *
 * page="main2" identifica as seções com texto próprio de página (Header2/
 * Hero2/Library2/OneScreenStats/Footer2) — hoje com o mesmo conteúdo de
 * Sobre2.jsx, mas pronto pra divergir só editando os locales de
 * landing2.json, sem tocar em componente.
 */
export default function Main2() {
  return (
    <div className="landing-page">
      <Header2 page="main2" />
      <main>
        <Hero2 page="main2" />
        <Explore />
        <LiveDemo showTransport />
        <Library2 page="main2" />
        <BeforeAfter />
        <SetlistShowcase showHeader />
        <OneScreenStats page="main2" />
        <PricingSection />
      </main>
      <Footer2 page="main2" />
    </div>
  )
}
