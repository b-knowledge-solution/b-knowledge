/**
 * @fileoverview Terminal-style pipeline status bar showing parsing, graph extraction,
 * and embedding stages with real-time status indicators.
 * @module features/projects/components/PipelineStatusBar
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FileCode2, Network, Cpu, CheckCircle2, XCircle, Circle } from 'lucide-react'
import { syncVersionParserStatus } from '../api/projectApi'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the PipelineStatusBar component
 */
interface PipelineStatusBarProps {
  /** Dataset/knowledge base ID to monitor pipeline progress for */
  datasetId: string
  /** Project ID for API calls */
  projectId?: string
  /** Category ID for API calls */
  categoryId?: string
}

/** Pipeline stage status discriminator */
type StageStatus = 'pending' | 'running' | 'complete' | 'error'

/** A single pipeline stage descriptor */
interface PipelineStage {
  key: string
  labelKey: string
  icon: typeof FileCode2
  status: StageStatus
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Horizontal pipeline status bar showing parsing, graph extraction,
 *   and embedding stages. Each stage displays an icon, label, and status indicator.
 *   Uses polling on syncVersionParserStatus for real-time updates.
 *   Terminal-like aesthetic with dark background, monospace font, and colored indicators.
 * @param {PipelineStatusBarProps} props - Pipeline status configuration
 * @returns {JSX.Element} Rendered pipeline status bar
 */
export default function PipelineStatusBar({ datasetId, projectId, categoryId }: PipelineStatusBarProps) {
  const { t } = useTranslation()

  // Track pipeline stage statuses
  const [stages, setStages] = useState<PipelineStage[]>([
    { key: 'parsing', labelKey: 'projects.pipelineParsing', icon: FileCode2, status: 'pending' },
    { key: 'graph', labelKey: 'projects.pipelineGraphExtraction', icon: Network, status: 'pending' },
    { key: 'embedding', labelKey: 'projects.pipelineEmbedding', icon: Cpu, status: 'pending' },
  ])

  // Poll parser status to derive pipeline stage statuses
  useEffect(() => {
    // Guard: skip polling if required IDs are missing
    if (!projectId || !categoryId || !datasetId) return

    let cancelled = false

    const pollStatus = async () => {
      try {
        const statuses = await syncVersionParserStatus(projectId, categoryId, datasetId)

        // Skip update if component was unmounted
        if (cancelled) return

        // Derive overall pipeline status from individual document statuses
        const hasRunning = statuses.some((s) => s.ragflowRun === '1' || s.ragflowRun === '2')
        const hasError = statuses.some((s) => s.ragflowRun === '4')
        const allComplete = statuses.length > 0 && statuses.every((s) => s.ragflowRun === '3')

        setStages((prev) => prev.map((stage) => {
          // Map parse status to pipeline stages
          if (stage.key === 'parsing') {
            if (allComplete) return { ...stage, status: 'complete' as StageStatus }
            if (hasError) return { ...stage, status: 'error' as StageStatus }
            if (hasRunning) return { ...stage, status: 'running' as StageStatus }
            return { ...stage, status: 'pending' as StageStatus }
          }
          // Graph and embedding status are derived from parsing completion
          if (stage.key === 'graph') {
            if (allComplete) return { ...stage, status: 'complete' as StageStatus }
            if (hasRunning) return { ...stage, status: 'pending' as StageStatus }
            return stage
          }
          if (stage.key === 'embedding') {
            if (allComplete) return { ...stage, status: 'complete' as StageStatus }
            return stage
          }
          return stage
        }))
      } catch {
        // Silently ignore polling errors
      }
    }

    // Initial poll
    pollStatus()

    // Poll every 5 seconds
    const interval = setInterval(pollStatus, 5000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [projectId, categoryId, datasetId])

  /**
   * @description Render the status indicator icon for a pipeline stage
   * @param {StageStatus} status - Current stage status
   * @returns {JSX.Element} Status indicator icon
   */
  const renderStatusIcon = (status: StageStatus) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-3 w-3 text-emerald-400" />
      case 'running':
        return <Circle className="h-3 w-3 text-amber-400 animate-pulse" />
      case 'error':
        return <XCircle className="h-3 w-3 text-red-400" />
      default:
        return <Circle className="h-3 w-3 text-slate-600" />
    }
  }

  // Check if any stage is active (not all pending)
  const isActive = stages.some((s) => s.status !== 'pending')

  return (
    <div className="bg-slate-900 dark:bg-slate-900 border-b border-slate-800 px-4 py-1.5">
      <div className="flex items-center gap-4 font-mono text-xs">
        {/* Pipeline label */}
        <span className="text-slate-600 text-[10px] uppercase tracking-wide">
          {t('projects.pipelineStatus')}
        </span>

        {/* Show "Ready" when no active pipeline */}
        {!isActive && (
          <span className="text-slate-600">{t('projects.pipelineReady')}</span>
        )}

        {/* Pipeline stage indicators */}
        {isActive && stages.map((stage, idx) => (
          <div key={stage.key} className="flex items-center gap-1.5">
            {/* Connector line between stages */}
            {idx > 0 && (
              <span className={`w-4 h-px ${
                stage.status === 'complete' || stage.status === 'running'
                  ? 'bg-slate-500'
                  : 'bg-slate-800'
              }`} />
            )}
            {renderStatusIcon(stage.status)}
            <stage.icon className="h-3 w-3 text-slate-500" />
            <span className={`${
              stage.status === 'running' ? 'text-amber-400' :
              stage.status === 'complete' ? 'text-emerald-400' :
              stage.status === 'error' ? 'text-red-400' :
              'text-slate-600'
            }`}>
              {t(stage.labelKey)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
