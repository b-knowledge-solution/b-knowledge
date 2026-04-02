/**
 * @fileoverview Organization switcher component for multi-org users.
 *
 * Renders a Select dropdown when the user belongs to multiple organizations,
 * or a static text label when the user belongs to a single org.
 * Switching orgs triggers a session update via POST /api/auth/switch-org
 * and reloads the page to refresh all cached data.
 *
 * @module components/OrgSwitcher
 */

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslation } from 'react-i18next'
import { Loader2, Building2 } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Organization membership with user's role in that org
 */
interface Org {
  /** Organization unique identifier */
  id: string
  /** Organization display name */
  name: string
  /** User's role within this organization */
  role: string
}

/**
 * @description Props for the OrgSwitcher component
 */
interface OrgSwitcherProps {
  /** List of organizations the user belongs to */
  orgs: Org[]
  /** Currently active organization ID */
  currentOrgId: string
  /** Callback triggered when user selects a different org */
  onSwitch: (orgId: string) => void
  /** Whether an org switch operation is currently in progress */
  isLoading?: boolean
  /** Whether the sidebar is in collapsed (icon-only) mode */
  isCollapsed?: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Displays an organization selector for multi-org users or static org name for single-org users.
 * When the user switches orgs, the onSwitch callback is called which should trigger
 * a POST /api/auth/switch-org API call and page reload.
 *
 * @param {OrgSwitcherProps} props - Organization list, current selection, and switch handler
 * @returns {JSX.Element} Organization selector or static org label
 */
export function OrgSwitcher({ orgs, currentOrgId, onSwitch, isLoading, isCollapsed }: OrgSwitcherProps) {
  const { t } = useTranslation()
  const [isSwitching, setIsSwitching] = useState(false)

  // Find the current org for display
  const currentOrg = orgs.find(o => o.id === currentOrgId)

  /**
   * Handle org selection change. Sets switching state and delegates
   * to the parent's onSwitch callback.
   */
  function handleChange(orgId: string) {
    // Skip if selecting the already-active org
    if (orgId === currentOrgId) return

    setIsSwitching(true)
    onSwitch(orgId)
  }

  // Show loading spinner during org switch
  if (isSwitching || isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin" />
        {!isCollapsed && <span>{t('accessControl.orgSwitcher.switching')}</span>}
      </div>
    )
  }

  // Single org: show static text, no dropdown needed
  if (orgs.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2" title={currentOrg?.name}>
        <Building2 size={16} className="text-slate-400 flex-shrink-0" />
        {!isCollapsed && (
          <span className="text-sm text-slate-300 truncate">{currentOrg?.name || t('accessControl.orgSwitcher.label')}</span>
        )}
      </div>
    )
  }

  // Multi-org: render Select dropdown with org names and role labels
  return (
    <div className="px-2 py-1">
      <Select value={currentOrgId} onValueChange={handleChange}>
        <SelectTrigger
          className="w-full bg-white/5 border-white/10 text-white text-sm h-9 hover:bg-white/10"
          aria-label={t('accessControl.orgSwitcher.label')}
        >
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-slate-400 flex-shrink-0" />
            {!isCollapsed && <SelectValue placeholder={t('accessControl.orgSwitcher.label')} />}
          </div>
        </SelectTrigger>
        <SelectContent>
          {orgs.map(org => (
            <SelectItem key={org.id} value={org.id}>
              <span>{org.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">({org.role})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
