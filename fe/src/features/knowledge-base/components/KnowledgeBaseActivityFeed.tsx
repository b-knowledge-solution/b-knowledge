/**
 * @fileoverview Paginated activity feed for a knowledge base.
 * Displays audit log entries with action icons, descriptions, and relative timestamps.
 * @module features/knowledge-base/components/KnowledgeBaseActivityFeed
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import {
  UserPlus,
  UserMinus,
  Database,
  FileText,
  Settings,
  Activity,
  Link2,
  Unlink,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'

import { useKnowledgeBaseActivity } from '../api/knowledgeBaseQueries'
import type { ActivityEntry } from '../api/knowledgeBaseApi'

// ============================================================================
// Constants
// ============================================================================

/** Number of activity items to load per page */
const PAGE_SIZE = 20

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Map an activity action string to a Lucide icon for visual context
 * @param {string} action - The audit log action type
 * @returns {JSX.Element} Icon component matching the action type
 */
function getActivityIcon(action: string) {
  const iconClass = 'h-4 w-4 text-muted-foreground'

  // Match action to appropriate icon
  if (action.includes('member') && action.includes('add')) return <UserPlus className={iconClass} />
  if (action.includes('member') && action.includes('remove')) return <UserMinus className={iconClass} />
  if (action.includes('dataset') && action.includes('bind')) return <Link2 className={iconClass} />
  if (action.includes('dataset') && action.includes('unbind')) return <Unlink className={iconClass} />
  if (action.includes('dataset')) return <Database className={iconClass} />
  if (action.includes('document')) return <FileText className={iconClass} />
  if (action.includes('settings') || action.includes('update')) return <Settings className={iconClass} />
  return <Activity className={iconClass} />
}

/**
 * @description Build a human-readable activity description from an entry
 * @param {ActivityEntry} entry - The activity entry to describe
 * @returns {string} Formatted description string
 */
function formatActivityDescription(entry: ActivityEntry): string {
  const { action, resource_type, user_email } = entry
  return `${user_email} ${action.replace(/_/g, ' ')} ${resource_type.replace(/_/g, ' ')}`
}

// ============================================================================
// Types
// ============================================================================

interface KnowledgeBaseActivityFeedProps {
  /** Knowledge Base UUID to show activity for */
  knowledgeBaseId: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Paginated activity feed showing recent project audit log entries.
 * Uses "Load More" button (not infinite scroll) per project decisions.
 * Each entry shows an action icon, description, and relative time.
 * @param {KnowledgeBaseActivityFeedProps} props - Component props
 * @returns {JSX.Element} Rendered activity feed with load more pagination
 */
export default function KnowledgeBaseActivityFeed({ knowledgeBaseId }: KnowledgeBaseActivityFeedProps) {
  const { t } = useTranslation()

  // Track loaded items across pages
  const [loadedItems, setLoadedItems] = useState<ActivityEntry[]>([])
  const [offset, setOffset] = useState(0)

  // Fetch current page of activity
  const { data, isLoading } = useKnowledgeBaseActivity(knowledgeBaseId, PAGE_SIZE, offset)

  // Merge newly loaded items when data arrives
  const allItems = offset === 0 ? (data?.items ?? []) : loadedItems
  const total = data?.total ?? 0
  const hasMore = allItems.length < total

  /**
   * Load the next page of activity items.
   */
  const handleLoadMore = () => {
    if (data?.items) {
      // Append current page items to loaded items
      const merged = [...loadedItems, ...data.items]
      setLoadedItems(merged)
      setOffset(merged.length)
    }
  }

  // ── Loading (initial) ────────────────────────────────────────────
  if (isLoading && offset === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} />
      </div>
    )
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (allItems.length === 0) {
    return (
      <EmptyState
        icon={<Activity className="h-12 w-12 mx-auto" strokeWidth={1} />}
        title={t('knowledgeBase.activity.empty')}
        description={t('knowledgeBase.activity.emptyDescription')}
      />
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-foreground">
        {t('knowledgeBase.tabs.activity')}
      </h3>

      {/* Activity list */}
      <div className="space-y-1">
        {allItems.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start gap-3 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
          >
            {/* Action icon */}
            <div className="mt-0.5 flex-shrink-0">
              {getActivityIcon(entry.action)}
            </div>

            {/* Description and timestamp */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                {formatActivityDescription(entry)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Load More button */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isLoading}
          >
            {isLoading && <Spinner size={14} className="mr-2" />}
            {t('knowledgeBase.loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
