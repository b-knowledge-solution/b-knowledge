/**
 * @fileoverview Version badge component for dataset version indicators.
 * Displays "v{N}" badge next to dataset names for version datasets.
 *
 * @module features/datasets/components/VersionBadge
 */

import { Badge } from '@/components/ui/badge'

/**
 * @description Props for the VersionBadge component.
 */
interface VersionBadgeProps {
  /** Version number to display. Returns null when null/undefined (non-version datasets). */
  versionNumber: number | null | undefined
  /** Optional custom display label (e.g., '1.2.0', 'Q1 Release'). Takes priority over v{N} when present. */
  versionLabel?: string | null | undefined
}

/**
 * @description Displays a version badge for version datasets.
 * Renders custom versionLabel when present, otherwise falls back to "v{N}".
 * Returns null for non-version datasets (null/undefined version number).
 *
 * @param {VersionBadgeProps} props - Component props
 * @returns {JSX.Element | null} Rendered badge or null for non-version datasets
 */
const VersionBadge = ({ versionNumber, versionLabel }: VersionBadgeProps) => {
  // Only render for datasets that have a version number
  if (versionNumber == null) return null

  return (
    <Badge variant="secondary" className="text-xs px-1.5 py-0">
      {/* Display custom label when provided, fall back to v{N} */}
      {versionLabel || `v${versionNumber}`}
    </Badge>
  )
}

export default VersionBadge
