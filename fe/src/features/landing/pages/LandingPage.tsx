/**
 * @fileoverview Healthcare AI Chatbot Landing Page.
 * @description Public landing page showcasing the healthcare knowledge base AI chatbot
 * product with features, use cases, SDLC methodology, and CTAs.
 * @module features/landing/pages/LandingPage
 */

import { LandingNav } from '../components/LandingNav'
import { HeroSection } from '../components/HeroSection'
import { FeaturesSection } from '../components/FeaturesSection'
import { UseCasesSection } from '../components/UseCasesSection'
import { SDLCSection } from '../components/SDLCSection'
import { DeploymentSection } from '../components/DeploymentSection'
import { CTASection } from '../components/CTASection'
import { FooterSection } from '../components/FooterSection'

/**
 * @description Main landing page component composing all sections.
 * @returns The full landing page layout
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      {/* Sticky navigation */}
      <LandingNav />

      {/* Page sections */}
      <main>
        <HeroSection />
        <FeaturesSection />
        <UseCasesSection />
        <SDLCSection />
        <DeploymentSection />
        <CTASection />
      </main>

      {/* Footer */}
      <FooterSection />
    </div>
  )
}
