/**
 * @fileoverview Deployment options section for the healthcare landing page.
 * @description Showcases cloud, hybrid, and on-premise deployment methods.
 * @module features/landing/components/DeploymentSection
 */

import { useTranslation } from 'react-i18next'
import {
  Cloud,
  Server,
  Building2,
  CheckCircle2,
} from 'lucide-react'

/** @description Deployment option definition */
interface DeployOption {
  icon: React.ReactNode
  titleKey: string
  descKey: string
  featuresKey: string
  color: string
  badgeKey: string
}

/** @description Available deployment methods */
const DEPLOY_OPTIONS: DeployOption[] = [
  {
    icon: <Cloud className="w-7 h-7" />,
    titleKey: 'landing.deployment.cloud.title',
    descKey: 'landing.deployment.cloud.desc',
    featuresKey: 'landing.deployment.cloud.features',
    color: 'blue',
    badgeKey: 'landing.deployment.cloud.badge',
  },
  {
    icon: <Server className="w-7 h-7" />,
    titleKey: 'landing.deployment.hybrid.title',
    descKey: 'landing.deployment.hybrid.desc',
    featuresKey: 'landing.deployment.hybrid.features',
    color: 'purple',
    badgeKey: 'landing.deployment.hybrid.badge',
  },
  {
    icon: <Building2 className="w-7 h-7" />,
    titleKey: 'landing.deployment.onPremise.title',
    descKey: 'landing.deployment.onPremise.desc',
    featuresKey: 'landing.deployment.onPremise.features',
    color: 'green',
    badgeKey: 'landing.deployment.onPremise.badge',
  },
]

/** @description Color style mapping for each deployment type */
const DEPLOY_COLORS: Record<string, { bg: string; text: string; border: string; iconBg: string; badgeBg: string }> = {
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    iconBg: 'bg-blue-100 dark:bg-blue-900/50',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  },
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    text: 'text-purple-600 dark:text-purple-400',
    border: 'border-purple-200 dark:border-purple-800',
    iconBg: 'bg-purple-100 dark:bg-purple-900/50',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-200 dark:border-green-800',
    iconBg: 'bg-green-100 dark:bg-green-900/50',
    badgeBg: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  },
}

/**
 * @description Deployment options section showing cloud, hybrid, and on-premise methods.
 * @returns JSX element for the deployment section
 */
export function DeploymentSection() {
  const { t } = useTranslation()

  return (
    <section id="deployment" className="py-20 lg:py-28 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">
            {t('landing.deployment.label')}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            {t('landing.deployment.title')}
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300">
            {t('landing.deployment.subtitle')}
          </p>
        </div>

        {/* Deployment cards */}
        <div className="grid lg:grid-cols-3 gap-8">
          {DEPLOY_OPTIONS.map((option, i) => {
            const colors = DEPLOY_COLORS[option.color]!
            // Parse comma-separated features from i18n
            const features = t(option.featuresKey, { returnObjects: true }) as string[]

            return (
              <div
                key={i}
                className={`relative rounded-2xl border ${colors.border} ${colors.bg} p-8 hover:shadow-xl transition-all duration-300`}
              >
                {/* Badge */}
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-6 ${colors.badgeBg}`}>
                  {t(option.badgeKey)}
                </span>

                {/* Icon */}
                <div className={`w-14 h-14 rounded-2xl ${colors.iconBg} ${colors.text} flex items-center justify-center mb-5`}>
                  {option.icon}
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                  {t(option.titleKey)}
                </h3>

                {/* Description */}
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                  {t(option.descKey)}
                </p>

                {/* Feature checklist */}
                <ul className="space-y-3">
                  {(Array.isArray(features) ? features : []).map((feat, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${colors.text}`} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* Architecture diagram callout */}
        <div className="mt-16 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-8 lg:p-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
                {t('landing.deployment.architecture.title')}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                {t('landing.deployment.architecture.desc')}
              </p>
              <div className="flex flex-wrap gap-2">
                {['Docker', 'Kubernetes', 'Helm', 'Terraform', 'AWS', 'Azure', 'GCP', 'VMware'].map((tech) => (
                  <span
                    key={tech}
                    className="px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            {/* Visual deployment diagram */}
            <div className="grid grid-cols-3 gap-3">
              {/* Cloud layer */}
              <div className="col-span-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-center">
                <Cloud className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{t('landing.deployment.diagram.cloud')}</p>
                <p className="text-[10px] text-blue-500 dark:text-blue-400">{t('landing.deployment.diagram.cloudDesc')}</p>
              </div>
              {/* Hybrid layer */}
              <div className="col-span-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 text-center">
                <Server className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">{t('landing.deployment.diagram.hybrid')}</p>
                <p className="text-[10px] text-purple-500 dark:text-purple-400">{t('landing.deployment.diagram.hybridDesc')}</p>
              </div>
              {/* On-premise layer */}
              <div className="col-span-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
                <Building2 className="w-5 h-5 text-green-500 mx-auto mb-1" />
                <p className="text-xs font-semibold text-green-700 dark:text-green-300">{t('landing.deployment.diagram.onPremise')}</p>
                <p className="text-[10px] text-green-500 dark:text-green-400">{t('landing.deployment.diagram.onPremiseDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
