/**
 * @fileoverview Shared component for displaying SSE pipeline status.
 * Used by both chat and search streaming views to show the current
 * RAG pipeline stage (retrieving, reranking, generating, etc.).
 *
 * @module components/PipelineStatusIndicator
 */

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

/** Known pipeline status values emitted by the backend SSE stream. */
export type PipelineStatus =
  | 'refining_question'
  | 'retrieving'
  | 'searching_web'
  | 'searching_knowledge_graph'
  | 'reranking'
  | 'generating'
  | 'deep_research'

/**
 * Props for the PipelineStatusIndicator component.
 */
export interface PipelineStatusIndicatorProps {
  /** Current pipeline status string (null when idle) */
  status: string | null
  /** Optional descriptive message (e.g. deep research progress) */
  message?: string | undefined
  /** Display variant: 'badge' shows a compact badge, 'bar' shows a full-width bar */
  variant?: 'badge' | 'bar' | undefined
}

// ============================================================================
// Status label mapping
// ============================================================================

/** Human-readable labels for each pipeline status. */
const STATUS_LABELS: Record<string, string> = {
  refining_question: 'Refining question...',
  retrieving: 'Searching knowledge base...',
  searching_web: 'Searching the web...',
  searching_knowledge_graph: 'Querying knowledge graph...',
  reranking: 'Reranking results...',
  generating: 'Generating answer...',
  deep_research: 'Deep research...',
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Displays the current RAG pipeline status during SSE streaming.
 * Renders nothing when status is null (idle state).
 * @param props - Component props
 * @returns Pipeline status indicator or null
 */
export function PipelineStatusIndicator({
  status,
  message,
  variant = 'badge',
}: PipelineStatusIndicatorProps) {
  // Render nothing when idle
  if (!status) return null

  const label = STATUS_LABELS[status] ?? status
  const displayText = message ? `${label} ${message}` : label

  // Badge variant: compact inline indicator
  if (variant === 'badge') {
    return (
      <Badge
        variant="secondary"
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-normal',
          'animate-pulse'
        )}
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        {displayText}
      </Badge>
    )
  }

  // Bar variant: full-width status bar
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-border/50',
        'bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground',
        'animate-pulse'
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
      <span>{displayText}</span>
    </div>
  )
}
