/**
 * @fileoverview Footer section for the landing page.
 * @description Simple footer with copyright, links, and language switcher.
 * @module features/landing/components/FooterSection
 */

import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n'
import { useSettings } from '@/app/contexts/SettingsContext'
import logo from '@/assets/logo-dark.png'

/**
 * @description Landing page footer with branding, links, and language switcher.
 * @returns JSX footer element
 */
export function FooterSection() {
  const { t, i18n } = useTranslation()
  const { setLanguage } = useSettings()
  const year = new Date().getFullYear()

  /**
   * @description Change the application language via SettingsContext (which syncs with i18n and localStorage).
   * @param code - ISO 639-1 language code
   */
  const handleLanguageChange = (code: string) => {
    setLanguage(code as LanguageCode)
  }

  return (
    <footer className="bg-slate-900 dark:bg-slate-950 text-slate-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-3">
            <img src={logo} alt="Logo" className="h-8" />
            <p className="text-sm leading-relaxed">
              {t('landing.footer.description')}
            </p>
          </div>

          {/* Product links */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-3">{t('landing.footer.product')}</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="hover:text-white transition-colors">{t('landing.nav.features')}</a></li>
              <li><a href="#use-cases" className="hover:text-white transition-colors">{t('landing.nav.useCases')}</a></li>
              <li><a href="#sdlc" className="hover:text-white transition-colors">{t('landing.nav.sdlc')}</a></li>
            </ul>
          </div>

          {/* Compliance */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-3">{t('landing.footer.compliance')}</h4>
            <ul className="space-y-2 text-sm">
              <li>HIPAA</li>
              <li>HL7 FHIR</li>
              <li>GDPR</li>
              <li>SOC 2</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-3">{t('landing.footer.contact')}</h4>
            <ul className="space-y-2 text-sm">
              <li>contact@b-knowledge.ai</li>
              <li>1-800-HEALTH</li>
            </ul>
          </div>
        </div>

        {/* Bottom bar with language switcher */}
        <div className="border-t border-slate-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Copyright */}
          <p className="text-sm">&copy; {year} B-Knowledge. {t('landing.footer.rights')}</p>

          {/* Language switcher */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 mr-2">{t('landing.footer.language')}:</span>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  i18n.language === lang.code
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {lang.flag} {lang.nativeName}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
