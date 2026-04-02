/**
 * @fileoverview Individual version card with status badge and context menu.
 *
 * Displays version label, creation date, status badge (parsing/ready/error/archived),
 * and a dropdown context menu for archive and delete actions.
 * Active state is controlled by the parent VersionList.
 *
 * @module features/knowledge-base/components/VersionCard
 */

import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, Archive, Trash2, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { DocumentCategoryVersion } from '../api/knowledgeBaseApi'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the VersionCard component
 */
interface VersionCardProps {
  /** Version data to display */
  version: DocumentCategoryVersion
  /** Whether this card is currently expanded/active */
  isActive: boolean
  /** Callback when the card is clicked to expand/collapse */
  onClick: () => void
  /** Callback to delete this version */
  onDelete: (id: string) => void
  /** Callback to archive this version */
  onArchive: (id: string) => void
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Map version status to badge styling and icon
 * @param {string} status - Version status string
 * @returns {{ variant: string, icon: JSX.Element, label: string }} Badge config
 */
const getStatusConfig = (status: string) => {
  switch (status) {
    case 'parsing':
      return {
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        icon: <Loader2 className="h-3 w-3 mr-1 animate-spin" />,
        label: 'Parsing',
      }
    case 'ready':
      return {
        className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        icon: <CheckCircle className="h-3 w-3 mr-1" />,
        label: 'Ready',
      }
    case 'error':
      return {
        className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        icon: <XCircle className="h-3 w-3 mr-1" />,
        label: 'Error',
      }
    case 'archived':
      return {
        className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
        icon: <Archive className="h-3 w-3 mr-1" />,
        label: 'Archived',
      }
    default:
      return {
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        icon: <AlertCircle className="h-3 w-3 mr-1" />,
        label: status || 'Unknown',
      }
  }
}

/**
 * @description Format a date string into a human-readable format
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date
 */
const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders an individual version card with label, date, status badge,
 * and a context menu for archive/delete actions. Supports active/expanded state.
 * @param {VersionCardProps} props - Component props including version data and action callbacks
 * @returns {JSX.Element} Rendered version card
 */
const VersionCard = ({ version, isActive, onClick, onDelete, onArchive }: VersionCardProps) => {
  const { t } = useTranslation()
  const statusConfig = getStatusConfig(version.status)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        // Allow keyboard activation for accessibility
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={`
        relative p-3 rounded-lg border cursor-pointer transition-colors
        ${isActive
          ? 'border-primary bg-accent/50 dark:bg-accent/20'
          : 'border-border hover:border-primary/50 dark:border-slate-700 dark:hover:border-primary/50'
        }
      `}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Version label */}
          <span className="text-sm font-semibold text-foreground">
            {version.version_label}
          </span>

          {/* Status badge per UI-SPEC */}
          <Badge variant="secondary" className={statusConfig.className}>
            {statusConfig.icon}
            {statusConfig.label}
          </Badge>
        </div>

        {/* Context menu for archive and delete actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                // Prevent card click when opening menu
                e.stopPropagation()
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Archive option — only for non-archived versions */}
            {version.status !== 'archived' && (
              <DropdownMenuItem
                onClick={(e: MouseEvent<HTMLDivElement>) => {
                  e.stopPropagation()
                  onArchive(version.id)
                }}
              >
                <Archive className="h-4 w-4 mr-2" />
                {t('common.archive', 'Archive')}
              </DropdownMenuItem>
            )}
            {/* Delete option */}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e: MouseEvent<HTMLDivElement>) => {
                e.stopPropagation()
                onDelete(version.id)
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete', 'Delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Creation date */}
      <p className="text-xs text-muted-foreground mt-1">
        {formatDate(version.created_at)}
      </p>
    </div>
  )
}

export default VersionCard
