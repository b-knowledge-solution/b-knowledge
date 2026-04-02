/**
 * @fileoverview Inline Deep Research progress indicator for the chat message area.
 * Displays sub-query progress, budget usage, and warning/exhaustion messages
 * during the recursive deep research pipeline.
 *
 * @module features/chat/components/DeepResearchProgress
 */

import { useTranslation } from 'react-i18next'
import { Brain } from 'lucide-react'
import type { DeepResearchEvent } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

/**
 * @description Props for the DeepResearchProgress component.
 */
interface DeepResearchProgressProps {
  /** Array of structured deep research SSE events */
  events: DeepResearchEvent[]
  /** Whether the stream is currently active */
  isActive: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Compact inline card showing Deep Research progress during streaming.
 * Renders the current sub-query label, progress counter (N of M), token/call budget
 * indicators, and warning or exhaustion messages when budget limits are approached.
 *
 * @param {DeepResearchProgressProps} props - Component properties
 * @returns {JSX.Element | null} The rendered progress card, or null when inactive/empty
 */
function DeepResearchProgress({ events, isActive }: DeepResearchProgressProps) {
  const { t } = useTranslation()

  // Hide when not actively streaming or no events received yet
  if (!isActive || events.length === 0) return null

  // Derive display state from the events array by scanning from newest to oldest
  const latestStart = [...events].reverse().find((e) => e.subEvent === 'subquery_start')
  const budgetEvent = [...events].reverse().find((e) => e.tokensMax !== undefined)
  const warning = [...events].reverse().find((e) => e.subEvent === 'budget_warning')
  const exhausted = [...events].reverse().find((e) => e.subEvent === 'budget_exhausted')

  return (
    <div className="rounded-lg border bg-muted/50 p-3 mx-4 mb-2 space-y-1.5">
      {/* Header: brain icon + title */}
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Brain className="h-4 w-4 text-primary animate-pulse" />
        <span>{t('chat.deepResearch.title')}</span>
      </div>

      {/* Current sub-query label and progress counter */}
      {latestStart?.query && (
        <div className="text-xs text-muted-foreground">
          <span>{t('chat.deepResearch.researching', { query: latestStart.query })}</span>
          {/* Show sub-query counter when index and total are available */}
          {latestStart.index !== undefined && latestStart.total !== undefined && (
            <span className="ml-1.5 text-muted-foreground/70">
              ({t('chat.deepResearch.subQuery', { index: latestStart.index, total: latestStart.total })})
            </span>
          )}
        </div>
      )}

      {/* Budget indicators: tokens and calls used vs max */}
      {budgetEvent && (
        <div className="flex gap-3 text-xs text-muted-foreground/80">
          {budgetEvent.tokensUsed !== undefined && budgetEvent.tokensMax !== undefined && (
            <span>{t('chat.deepResearch.tokens', { used: budgetEvent.tokensUsed, max: budgetEvent.tokensMax })}</span>
          )}
          {budgetEvent.callsUsed !== undefined && budgetEvent.callsMax !== undefined && (
            <span>{t('chat.deepResearch.calls', { used: budgetEvent.callsUsed, max: budgetEvent.callsMax })}</span>
          )}
        </div>
      )}

      {/* Budget warning message */}
      {warning && !exhausted && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t('chat.deepResearch.budgetWarning')}
        </p>
      )}

      {/* Budget exhausted message */}
      {exhausted && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {t('chat.deepResearch.budgetExhausted')}
        </p>
      )}
    </div>
  )
}

export default DeepResearchProgress
