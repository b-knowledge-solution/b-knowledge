/**
 * @fileoverview Navigation bar for the landing page.
 * @description Sticky nav with logo, section links, and login CTA.
 * @module features/landing/components/LandingNav
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'
import logo from '@/assets/logo.png'
import logoDark from '@/assets/logo-dark.png'

/**
 * @description Sticky navigation bar for the landing page with mobile menu.
 * @returns JSX element for the landing navigation
 */
export function LandingNav() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Track scroll position for background effect
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Detect dark mode
  const isDark = document.documentElement.classList.contains('dark')

  /** @description Navigation links */
  const links = [
    { label: t('landing.nav.features'), href: '#features' },
    { label: t('landing.nav.useCases'), href: '#use-cases' },
    { label: t('landing.nav.sdlc'), href: '#sdlc' },
    { label: t('landing.nav.deployment'), href: '#deployment' },
  ]

  /**
   * @description Smooth scroll to section
   * @param href - The anchor href to scroll to
   */
  const scrollTo = (href: string) => {
    setMobileOpen(false)
    const el = document.querySelector(href)
    el?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled
        ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-sm border-b border-slate-200/50 dark:border-slate-700/50'
        : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <img src={isDark ? logoDark : logo} alt="Logo" className="h-8" />
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href)}
                className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
              {t('landing.nav.login')}
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg" onClick={() => navigate('/login')}>
              {t('landing.nav.getStarted')}
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-slate-600 dark:text-slate-300"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="space-y-2">
              {links.map((link) => (
                <button
                  key={link.href}
                  onClick={() => scrollTo(link.href)}
                  className="block w-full text-left px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  {link.label}
                </button>
              ))}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate('/login')}>
                  {t('landing.nav.getStarted')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
