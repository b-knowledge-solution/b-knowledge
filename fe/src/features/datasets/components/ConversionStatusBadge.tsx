/**
 * @fileoverview Color-coded status badge for version file lifecycle.
 * Maps file status to appropriate badge variant and color.
 *
 * @module features/datasets/components/ConversionStatusBadge
 */

import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { VersionFileStatus } from '../types'

// ============================================================================
// Types
// ============================================================================

interface ConversionStatusBadgeProps {
  /** @description File status to display */
  status: VersionFileStatus
}

// ============================================================================
// Status Configuration
// ============================================================================

/** @description Map of status to display properties */
const STATUS_CONFIG: Record<VersionFileStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  pending: { variant: 'secondary', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  converting: { variant: 'outline', className: 'border-blue-300 text-blue-600 dark:border-blue-600 dark:text-blue-400 animate-pulse' },
  converted: { variant: 'outline', className: 'border-cyan-300 text-cyan-600 dark:border-cyan-600 dark:text-cyan-400' },
  imported: { variant: 'outline', className: 'border-indigo-300 text-indigo-600 dark:border-indigo-600 dark:text-indigo-400' },
  parsing: { variant: 'outline', className: 'border-amber-300 text-amber-600 dark:border-amber-600 dark:text-amber-400 animate-pulse' },
  done: { variant: 'default', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { variant: 'destructive', className: '' },
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders a color-coded badge for version file status.
 *
 * @param {ConversionStatusBadgeProps} props - Component props
 * @returns {JSX.Element} The rendered badge
 */
const ConversionStatusBadge = ({ status }: ConversionStatusBadgeProps) => {
  const { t } = useTranslation()

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  const label = t(`versions.fileStatus.${status}`)

  return (
    <Badge variant={config.variant} className={config.className}>
      {label}
    </Badge>
  )
}

export default ConversionStatusBadge
