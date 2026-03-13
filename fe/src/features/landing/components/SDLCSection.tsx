/**
 * @fileoverview SDLC (Software Development Life Cycle) section for healthcare product.
 * @description Shows the development methodology and phases for the healthcare AI chatbot.
 * @module features/landing/components/SDLCSection
 */

import { useTranslation } from 'react-i18next'
import {
  Search,
  PenTool,
  Code,
  TestTube,
  Rocket,
  RefreshCw,
} from 'lucide-react'

/** @description SDLC phase definition */
interface Phase {
  icon: React.ReactNode
  titleKey: string
  descKey: string
  color: string
}

/** @description All SDLC phases */
const PHASES: Phase[] = [
  { icon: <Search className="w-5 h-5" />, titleKey: 'landing.sdlc.phases.discovery.title', descKey: 'landing.sdlc.phases.discovery.desc', color: 'blue' },
  { icon: <PenTool className="w-5 h-5" />, titleKey: 'landing.sdlc.phases.design.title', descKey: 'landing.sdlc.phases.design.desc', color: 'purple' },
  { icon: <Code className="w-5 h-5" />, titleKey: 'landing.sdlc.phases.develop.title', descKey: 'landing.sdlc.phases.develop.desc', color: 'green' },
  { icon: <TestTube className="w-5 h-5" />, titleKey: 'landing.sdlc.phases.test.title', descKey: 'landing.sdlc.phases.test.desc', color: 'amber' },
  { icon: <Rocket className="w-5 h-5" />, titleKey: 'landing.sdlc.phases.deploy.title', descKey: 'landing.sdlc.phases.deploy.desc', color: 'red' },
  { icon: <RefreshCw className="w-5 h-5" />, titleKey: 'landing.sdlc.phases.iterate.title', descKey: 'landing.sdlc.phases.iterate.desc', color: 'cyan' },
]

/** @description Color variants for each phase */
const COLOR_MAP: Record<string, { bg: string; text: string; border: string; line: string }> = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/50', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800', line: 'bg-blue-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-900/50', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800', line: 'bg-purple-400' },
  green: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-800', line: 'bg-green-400' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', line: 'bg-amber-400' },
  red: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800', line: 'bg-red-400' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/50', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-800', line: 'bg-cyan-400' },
}

/**
 * @description SDLC methodology section with timeline visualization.
 * @returns JSX element showing SDLC phases
 */
export function SDLCSection() {
  const { t } = useTranslation()

  return (
    <section id="sdlc" className="py-20 lg:py-28 bg-slate-50 dark:bg-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">
            {t('landing.sdlc.label')}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            {t('landing.sdlc.title')}
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            {t('landing.sdlc.subtitle')}
          </p>
        </div>

        {/* Timeline */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {PHASES.map((phase, i) => {
            const colors = COLOR_MAP[phase.color]!
            return (
              <div key={i} className="relative">
                {/* Phase number */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center`}>
                    {phase.icon}
                  </div>
                  <span className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>
                    {t('landing.sdlc.phase')} {i + 1}
                  </span>
                </div>

                {/* Content card */}
                <div className={`p-5 rounded-xl border ${colors.border} bg-white dark:bg-slate-800`}>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                    {t(phase.titleKey)}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {t(phase.descKey)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Healthcare compliance callout */}
        <div className="mt-16 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-8 lg:p-12 text-white">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-2xl font-bold mb-3">{t('landing.sdlc.compliance.title')}</h3>
              <p className="text-blue-100 leading-relaxed">{t('landing.sdlc.compliance.desc')}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { name: 'HIPAA', descKey: 'landing.sdlc.compliance.hipaaDesc' },
                { name: 'HL7 FHIR', descKey: 'landing.sdlc.compliance.fhirDesc' },
                { name: 'GDPR', descKey: 'landing.sdlc.compliance.gdprDesc' },
                { name: 'SOC 2', descKey: 'landing.sdlc.compliance.soc2Desc' },
                { name: 'ISO 13485', descKey: 'landing.sdlc.compliance.iso13485Desc' },
                { name: 'ISO 14971', descKey: 'landing.sdlc.compliance.iso14971Desc' },
                { name: 'IEC 62304', descKey: 'landing.sdlc.compliance.iec62304Desc' },
                { name: 'IEC 62443', descKey: 'landing.sdlc.compliance.iec62443Desc' },
              ].map((cert) => (
                <div key={cert.name} className="bg-white/10 backdrop-blur rounded-xl p-4 text-center">
                  <p className="font-bold text-lg">{cert.name}</p>
                  <p className="text-xs text-blue-200">{t(cert.descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
