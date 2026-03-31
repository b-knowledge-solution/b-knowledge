/**
 * @fileoverview Debug panel for step-by-step agent execution inspection.
 *
 * Right-side panel (360px fixed width per UI-SPEC) showing the ordered list
 * of nodes with execution status badges, step/continue/stop controls,
 * breakpoint indicators, and collapsible input/output JSON views.
 *
 * Replaces NodeConfigPanel when debug mode is active.
 *
 * @module features/agents/components/debug/DebugPanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Play,
  SkipForward,
  Square,
  Circle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DebugStepState } from '../../hooks/useAgentDebug'
import type { AgentStepStatus } from '../../types/agent.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the DebugPanel component
 */
interface DebugPanelProps {
  /** Map of nodeId to step state from useAgentDebug */
  steps: Map<string, DebugStepState>
  /** Set of node IDs with active breakpoints */
  breakpoints: Set<string>
  /** Total number of nodes in the agent graph */
  totalNodes: number
  /** Handler to execute the next pending node */
  onStepNext: () => void
  /** Handler to continue executing all remaining nodes */
  onContinueRun: () => void
  /** Handler to stop the debug session */
  onStop: () => void
  /** Handler to toggle a breakpoint on a node */
  onToggleBreakpoint: (nodeId: string) => void
  /** Ordered list of node IDs in execution order */
  nodeOrder: string[]
  /** Map of node IDs to their display labels */
  nodeLabels: Record<string, string>
}

// ============================================================================
// Helper Components
// ============================================================================

/**
 * @description Returns the appropriate badge variant and label for a step status
 * @param {AgentStepStatus} status - Step execution status
 * @returns {{ variant: string; label: string; className: string }} Badge styling
 */
function getStatusBadge(status: AgentStepStatus): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  label: string
  className: string
} {
  switch (status) {
    case 'pending':
      return { variant: 'secondary', label: 'Pending', className: 'text-muted-foreground' }
    case 'running':
      return { variant: 'default', label: 'Running', className: 'bg-blue-500 animate-pulse' }
    case 'completed':
      return { variant: 'default', label: 'Completed', className: 'bg-emerald-500' }
    case 'failed':
      return { variant: 'destructive', label: 'Failed', className: '' }
    case 'skipped':
      return { variant: 'secondary', label: 'Skipped', className: 'line-through text-muted-foreground' }
    default:
      return { variant: 'outline', label: status, className: '' }
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Right-side debug panel for step-by-step agent execution.
 *   Shows execution progress, step/continue/stop controls, ordered node list
 *   with status badges, breakpoint indicators, and collapsible JSON I/O views.
 * @param {DebugPanelProps} props - Debug state and control handlers
 * @returns {JSX.Element} 360px fixed-width debug panel
 */
export function DebugPanel({
  steps,
  breakpoints,
  totalNodes,
  onStepNext,
  onContinueRun,
  onStop,
  onToggleBreakpoint,
  nodeOrder,
  nodeLabels,
}: DebugPanelProps) {
  const { t } = useTranslation()
  const [expandedNode, setExpandedNode] = useState<string | null>(null)

  // Calculate completion progress
  const completedCount = [...steps.values()].filter(
    (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
  ).length
  const progressPercent = totalNodes > 0 ? (completedCount / totalNodes) * 100 : 0

  return (
    <div className="w-[360px] border-l bg-background flex flex-col h-full">
      {/* Header with controls */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {t('agents.debug', 'Debug')}
          </h3>
          <Button variant="ghost" size="sm" onClick={onStop}>
            <Square className="h-3 w-3 mr-1" />
            {t('common.stop', 'Stop')}
          </Button>
        </div>

        {/* Step and Continue buttons */}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onStepNext} className="flex-1">
            <SkipForward className="h-3 w-3 mr-1" />
            {t('agents.stepNext', 'Step')}
          </Button>
          <Button size="sm" variant="outline" onClick={onContinueRun} className="flex-1">
            <Play className="h-3 w-3 mr-1" />
            {t('agents.continueRun', 'Continue')}
          </Button>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{completedCount} / {totalNodes}</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </div>

      {/* Node list with status badges and breakpoints */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {nodeOrder.map((nodeId) => {
            const step = steps.get(nodeId)
            const status = step?.status ?? 'pending'
            const badge = getStatusBadge(status)
            const hasBreakpoint = breakpoints.has(nodeId)
            const isExpanded = expandedNode === nodeId
            const label = nodeLabels[nodeId] || nodeId

            return (
              <div key={nodeId} className="rounded-md border bg-card">
                {/* Node row */}
                <div className="flex items-center gap-2 px-3 py-2">
                  {/* Breakpoint indicator (clickable red/gray circle) */}
                  <button
                    className="flex-shrink-0"
                    onClick={() => onToggleBreakpoint(nodeId)}
                    title={hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}
                  >
                    <Circle
                      className={`h-3 w-3 ${
                        hasBreakpoint
                          ? 'fill-red-500 text-red-500'
                          : 'text-muted-foreground/30 hover:text-muted-foreground'
                      }`}
                    />
                  </button>

                  {/* Expand/collapse toggle for completed nodes with data */}
                  <button
                    className="flex-shrink-0"
                    onClick={() => setExpandedNode(isExpanded ? null : nodeId)}
                  >
                    {isExpanded
                      ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    }
                  </button>

                  {/* Node label */}
                  <span
                    className={`text-sm flex-1 truncate ${
                      status === 'skipped' ? 'line-through text-muted-foreground' : ''
                    }`}
                  >
                    {label}
                  </span>

                  {/* Status badge */}
                  <Badge
                    variant={badge.variant}
                    className={`text-xs ${badge.className}`}
                  >
                    {badge.label}
                  </Badge>

                  {/* Duration display for completed/failed steps */}
                  {step?.duration_ms !== undefined && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {step.duration_ms}ms
                    </span>
                  )}
                </div>

                {/* Expanded detail section: input/output JSON */}
                {isExpanded && step && (
                  <div className="px-3 pb-3 space-y-2 border-t">
                    {/* Error message for failed steps */}
                    {step.error && (
                      <div className="mt-2 text-xs text-destructive bg-destructive/10 rounded p-2">
                        {step.error}
                      </div>
                    )}

                    {/* Input data */}
                    {step.input && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
                        <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-40">
                          {JSON.stringify(step.input, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Output data */}
                    {step.output && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                        <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-40">
                          {JSON.stringify(step.output, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
