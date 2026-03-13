/**
 * @fileoverview Footer section for the landing page.
 * @description Simple footer with copyright and links.
 * @module features/landing/components/FooterSection
 */

import { useTranslation } from 'react-i18next'
import logo from '@/assets/logo-dark.png'

/**
 * @description Landing page footer with branding and links.
 * @returns JSX footer element
 */
export function FooterSection() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

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

        {/* Bottom bar */}
        <div className="border-t border-slate-800 pt-8 text-sm text-center">
          <p>&copy; {year} B-Knowledge. {t('landing.footer.rights')}</p>
        </div>
      </div>
    </footer>
  )
}
