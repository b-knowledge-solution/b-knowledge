/**
 * @fileoverview Features section for the healthcare landing page.
 * @description Showcases key product capabilities with icons and descriptions.
 * @module features/landing/components/FeaturesSection
 */

import { useTranslation } from 'react-i18next'
import {
  Brain,
  FileSearch,
  ShieldCheck,
  MessageSquareText,
  Database,
  Zap,
  ClipboardList,
  Users,
  Globe,
} from 'lucide-react'

/** @description Feature card data shape */
interface Feature {
  icon: React.ReactNode
  titleKey: string
  descKey: string
}

/** @description All features displayed in the grid */
const FEATURES: Feature[] = [
  { icon: <Brain className="w-6 h-6" />, titleKey: 'landing.features.ragChat.title', descKey: 'landing.features.ragChat.desc' },
  { icon: <FileSearch className="w-6 h-6" />, titleKey: 'landing.features.docSearch.title', descKey: 'landing.features.docSearch.desc' },
  { icon: <ShieldCheck className="w-6 h-6" />, titleKey: 'landing.features.hipaa.title', descKey: 'landing.features.hipaa.desc' },
  { icon: <MessageSquareText className="w-6 h-6" />, titleKey: 'landing.features.multiTurn.title', descKey: 'landing.features.multiTurn.desc' },
  { icon: <Database className="w-6 h-6" />, titleKey: 'landing.features.knowledgeBase.title', descKey: 'landing.features.knowledgeBase.desc' },
  { icon: <Zap className="w-6 h-6" />, titleKey: 'landing.features.realtime.title', descKey: 'landing.features.realtime.desc' },
  { icon: <ClipboardList className="w-6 h-6" />, titleKey: 'landing.features.audit.title', descKey: 'landing.features.audit.desc' },
  { icon: <Users className="w-6 h-6" />, titleKey: 'landing.features.roleAccess.title', descKey: 'landing.features.roleAccess.desc' },
  { icon: <Globe className="w-6 h-6" />, titleKey: 'landing.features.multilang.title', descKey: 'landing.features.multilang.desc' },
]

/**
 * @description Features grid section with icon cards.
 * @returns JSX element for the features section
 */
export function FeaturesSection() {
  const { t } = useTranslation()

  return (
    <section id="features" className="py-20 lg:py-28 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">
            {t('landing.features.label')}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            {t('landing.features.title')}
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            {t('landing.features.subtitle')}
          </p>
        </div>

        {/* Feature cards grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((feature, i) => (
            <div
              key={i}
              className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg transition-all duration-300"
            >
              {/* Icon */}
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform">
                {feature.icon}
              </div>
              {/* Title */}
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                {t(feature.titleKey)}
              </h3>
              {/* Description */}
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                {t(feature.descKey)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
