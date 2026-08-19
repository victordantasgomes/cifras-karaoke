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
 * /sobre — réplica do layout/conteúdo da referência "Central Musical",
 * chaves i18n em landing2.json (namespace sobre2).
 */
export default function Sobre2() {
  return (
    <div className="landing-page">
      <Header2 />
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
