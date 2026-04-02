/**
 * @fileoverview Run history sheet for viewing past agent execution runs.
 * Displays a list of runs with status badges, duration, and expandable error details.
 *
 * @module features/agents/components/RunHistorySheet
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useAgentRuns, useSubmitAgentRunFeedback } from '../api/agentQueries'
import { FeedbackCommentPopover } from '@/components/FeedbackCommentPopover'
import type { AgentRun, AgentRunStatus } from '../types/agent.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the RunHistorySheet component
 */
interface RunHistorySheetProps {
  /** Whether the sheet is open */
  open: boolean
  /** Callback to close the sheet */
  onClose: () => void
  /** Agent UUID whose runs are displayed */
  agentId: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Map run status to badge styling variant and optional animation class
 * @param {AgentRunStatus} status - Run status
 * @returns {{ variant: string; className: string }} Badge styling config
 */
function getStatusStyle(status: AgentRunStatus): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string } {
  switch (status) {
    case 'pending':
      return { variant: 'secondary', className: 'bg-muted text-muted-foreground' }
    case 'running':
      return { variant: 'default', className: 'bg-blue-500 text-white animate-pulse' }
    case 'completed':
      return { variant: 'default', className: 'bg-emerald-500 text-white' }
    case 'failed':
      return { variant: 'destructive', className: '' }
    case 'cancelled':
      return { variant: 'secondary', className: 'bg-muted text-muted-foreground' }
    default:
      return { variant: 'outline', className: '' }
  }
}

/**
 * @description Format milliseconds duration into a human-readable string
 * @param {number | null} ms - Duration in milliseconds
 * @returns {string} Formatted duration string (e.g., "1.2s", "45.0s", "2m 30s")
 */
function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-'
  // Short durations display as seconds with one decimal
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  // Longer durations display as minutes and seconds
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Side sheet displaying agent execution run history with status badges,
 *   trigger type, duration, and expandable error details for failed runs.
 * @param {RunHistorySheetProps} props - Sheet configuration
 * @returns {JSX.Element} Rendered run history sheet
 */
export function RunHistorySheet({ open, onClose, agentId }: RunHistorySheetProps) {
  const { t } = useTranslation()
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  // Track feedback state per run (keyed by run ID)
  const [runFeedback, setRunFeedback] = useState<Record<string, 'up' | 'down' | null>>({})

  // Fetch run history for the agent
  const { data: runs, isLoading } = useAgentRuns(agentId)
  const runList = (runs ?? []) as AgentRun[]

  // Mutation for submitting run feedback
  const feedbackMutation = useSubmitAgentRunFeedback()

  /**
   * Toggle expanded state for a run row to show error/output details
   */
  const toggleExpand = (runId: string) => {
    setExpandedRunId((prev) => prev === runId ? null : runId)
  }

  /**
   * @description Handle feedback submission for a completed agent run.
   * Updates local state and sends feedback to backend.
   * @param {AgentRun} run - The agent run being evaluated
   * @param {boolean} thumbup - True for positive, false for negative
   * @param {string} [comment] - Optional feedback comment
   */
  const handleRunFeedback = (run: AgentRun, thumbup: boolean, comment?: string) => {
    setRunFeedback((prev) => ({ ...prev, [run.id]: thumbup ? 'up' : 'down' }))
    feedbackMutation.mutate({
      runId: run.id,
      thumbup,
      ...(comment ? { comment } : {}),
      query: run.input || '[Agent run]',
      answer: run.output || '[No output]',
    })
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose() }}>
      <SheetContent side="right" className="w-[400px] sm:w-[450px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('agents.runHistory', 'Run History')}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-2">
          {isLoading ? (
            // Skeleton loading state
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : runList.length === 0 ? (
            // Empty state
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t('agents.noRunsYet', 'No runs yet')}
            </div>
          ) : (
            // Run list
            <div className="space-y-2">
              {runList.map((run) => {
                const statusStyle = getStatusStyle(run.status)
                const isExpanded = expandedRunId === run.id

                return (
                  <div
                    key={run.id}
                    className="rounded-md border border-border overflow-hidden"
                  >
                    {/* Run summary row */}
                    <button
                      type="button"
                      className="w-full flex items-center justify-between p-3 hover:bg-muted/50 dark:hover:bg-muted/20 text-left"
                      onClick={() => toggleExpand(run.id)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge className={statusStyle.className}>
                          {run.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground capitalize">
                          {run.trigger_type}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 ml-2 text-xs text-muted-foreground">
                        {/* Duration display */}
                        <span>{formatDuration(run.duration_ms)}</span>
                        {/* Node progress */}
                        <span>{run.completed_nodes}/{run.total_nodes}</span>

                        {/* Feedback buttons — only on completed runs */}
                        {run.status === 'completed' && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <FeedbackCommentPopover
                              feedback={runFeedback[run.id] || null}
                              onFeedback={(thumbup, comment) => handleRunFeedback(run, thumbup, comment)}
                              size="sm"
                            />
                          </div>
                        )}

                        {/* Expand chevron */}
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </button>

                    {/* Expanded detail section */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/30 dark:bg-muted/10 p-3 space-y-2">
                        {/* Timestamps */}
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">{t('agents.startedAt', 'Started')}:</span>{' '}
                          {run.started_at ? new Date(run.started_at).toLocaleString() : '-'}
                        </div>

                        {/* Error message for failed runs */}
                        {run.status === 'failed' && run.error && (
                          <div className="text-xs">
                            <span className="font-medium text-destructive">
                              {t('common.error', 'Error')}:
                            </span>
                            <pre className="mt-1 p-2 bg-destructive/10 rounded text-destructive text-xs whitespace-pre-wrap break-words">
                              {run.error}
                            </pre>
                          </div>
                        )}

                        {/* Output summary for completed runs */}
                        {run.status === 'completed' && run.output && (
                          <div className="text-xs">
                            <span className="font-medium">
                              {t('common.output', 'Output')}:
                            </span>
                            <pre className="mt-1 p-2 bg-muted rounded text-xs whitespace-pre-wrap break-words max-h-32 overflow-auto">
                              {run.output}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
