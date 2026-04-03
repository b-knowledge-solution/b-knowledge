/**
 * @fileoverview Hero section for the healthcare landing page.
 * @description Displays the main headline, value proposition, and CTA buttons.
 * @module features/landing/components/HeroSection
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth'
import { config } from '@/config'
import { Button } from '@/components/ui/button'
import { ArrowRight, Bot, ShieldCheck } from 'lucide-react'

/**
 * @description Hero section with animated gradient background, headline, and CTAs.
 * @returns The hero section JSX element
 */
export function HeroSection() {
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
    <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 min-h-[90vh] flex items-center">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-200/30 dark:bg-blue-900/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-200/30 dark:bg-cyan-900/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-100/20 dark:bg-indigo-900/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left column - Text content */}
          <div className="space-y-8">
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-full text-green-700 dark:text-green-300 text-sm font-medium">
              <ShieldCheck className="w-4 h-4" />
              {t('landing.hero.badge')}
            </div>

            {/* Main headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              {t('landing.hero.title')}
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-400 dark:to-cyan-300">
                {t('landing.hero.titleHighlight')}
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
              {t('landing.hero.subtitle')}
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-blue-600/25"
                onClick={handleSignIn}
              >
                {t('landing.hero.cta')}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="px-8 py-6 text-lg rounded-xl border-slate-300 dark:border-slate-600"
                onClick={() => {
                  // Scroll to features section
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                {t('landing.hero.learnMore')}
              </Button>
            </div>

            {/* Trust metrics */}
            <div className="flex flex-wrap gap-8 pt-4">
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">99.9%</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('landing.hero.uptime')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">HIPAA</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('landing.hero.compliant')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">24/7</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{t('landing.hero.support')}</p>
              </div>
            </div>
          </div>

          {/* Right column - Visual */}
          <div className="relative lg:pl-8">
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
              {/* Chat window mock */}
              <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-700">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white text-sm">{t('landing.hero.chatBot')}</p>
                  <p className="text-xs text-green-500">{t('landing.hero.online')}</p>
                </div>
              </div>

              {/* Mock messages */}
              <div className="space-y-3">
                <div className="flex justify-end">
                  <div className="bg-blue-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%] text-sm">
                    {t('landing.hero.mockQuestion')}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%] text-sm leading-relaxed">
                    {t('landing.hero.mockAnswer')}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[85%] text-xs">
                    {t('landing.hero.mockCitation')}
                  </div>
                </div>
              </div>

              {/* Input bar mock */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <div className="flex-1 bg-slate-50 dark:bg-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-400">
                  {t('landing.hero.inputPlaceholder')}
                </div>
                <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>

            {/* Floating badges */}
            <div className="absolute -top-4 -left-4 bg-white dark:bg-slate-800 shadow-lg rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300">
              RAG-Powered
            </div>
            <div className="absolute -bottom-4 -right-4 bg-white dark:bg-slate-800 shadow-lg rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('landing.hero.evidenceBased')}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
