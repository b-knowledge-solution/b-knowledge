/**
 * @fileoverview Use cases section for healthcare AI chatbot.
 * @description Displays real-world healthcare scenarios the product addresses.
 * @module features/landing/components/UseCasesSection
 */

import { useTranslation } from 'react-i18next'
import {
  Stethoscope,
  Pill,
  HeartPulse,
  GraduationCap,
  ClipboardCheck,
  Hospital,
} from 'lucide-react'

/** @description Use case items */
const USE_CASES = [
  { icon: <Stethoscope className="w-6 h-6" />, titleKey: 'landing.useCases.clinical.title', descKey: 'landing.useCases.clinical.desc' },
  { icon: <Pill className="w-6 h-6" />, titleKey: 'landing.useCases.pharmacy.title', descKey: 'landing.useCases.pharmacy.desc' },
  { icon: <HeartPulse className="w-6 h-6" />, titleKey: 'landing.useCases.patient.title', descKey: 'landing.useCases.patient.desc' },
  { icon: <GraduationCap className="w-6 h-6" />, titleKey: 'landing.useCases.training.title', descKey: 'landing.useCases.training.desc' },
  { icon: <ClipboardCheck className="w-6 h-6" />, titleKey: 'landing.useCases.compliance.title', descKey: 'landing.useCases.compliance.desc' },
  { icon: <Hospital className="w-6 h-6" />, titleKey: 'landing.useCases.operations.title', descKey: 'landing.useCases.operations.desc' },
]

/**
 * @description Use cases grid section.
 * @returns JSX element showing healthcare use cases
 */
export function UseCasesSection() {
  const { t } = useTranslation()

  return (
    <section id="use-cases" className="py-20 lg:py-28 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">
            {t('landing.useCases.label')}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            {t('landing.useCases.title')}
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            {t('landing.useCases.subtitle')}
          </p>
        </div>

        {/* Use case cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {USE_CASES.map((uc, i) => (
            <div
              key={i}
              className="relative p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-white dark:from-slate-800 dark:to-slate-800/50 border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-all duration-300"
            >
              {/* Icon */}
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-500/25">
                {uc.icon}
              </div>
              {/* Title */}
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                {t(uc.titleKey)}
              </h3>
              {/* Description */}
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {t(uc.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
