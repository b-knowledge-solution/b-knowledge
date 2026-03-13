/**
 * @fileoverview Call-to-action section for the healthcare landing page.
 * @description Final CTA with contact form prompt and footer.
 * @module features/landing/components/CTASection
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { config } from '@/config'
import { Button } from '@/components/ui/button'
import { ArrowRight, Mail, Phone } from 'lucide-react'

/**
 * @description Bottom CTA section with gradient background and contact info.
 * @returns JSX element for CTA section
 */
export function CTASection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  /** @description Navigate to app if authenticated, otherwise to login */
  const handleSignIn = () => {
    if (isAuthenticated) {
      const defaultPath = config.features.enableAiChat ? '/chat' : '/search'
      navigate(defaultPath)
    } else {
      navigate('/login')
    }
  }

  return (
    <section className="py-20 lg:py-28 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 dark:from-blue-900 dark:via-indigo-900 dark:to-slate-900 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
          {t('landing.cta.title')}
        </h2>
        <p className="text-lg text-blue-100 mb-10 max-w-2xl mx-auto leading-relaxed">
          {t('landing.cta.subtitle')}
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button
            size="lg"
            className="bg-white text-blue-700 hover:bg-blue-50 px-8 py-6 text-lg rounded-xl font-semibold shadow-xl"
            onClick={handleSignIn}
          >
            {t('landing.cta.getStarted')}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="border-white/30 text-white hover:bg-white/10 px-8 py-6 text-lg rounded-xl"
          >
            {t('landing.cta.requestDemo')}
          </Button>
        </div>

        {/* Contact info */}
        <div className="flex flex-col sm:flex-row gap-6 justify-center text-blue-200 text-sm">
          <a href="mailto:contact@b-knowledge.ai" className="flex items-center gap-2 hover:text-white transition-colors">
            <Mail className="w-4 h-4" />
            contact@b-knowledge.ai
          </a>
          <a href="tel:+1-800-HEALTH" className="flex items-center gap-2 hover:text-white transition-colors">
            <Phone className="w-4 h-4" />
            1-800-HEALTH
          </a>
        </div>
      </div>
    </section>
  )
}
