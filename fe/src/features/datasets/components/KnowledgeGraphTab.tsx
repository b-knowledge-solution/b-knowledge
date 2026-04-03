/**
 * @fileoverview Knowledge Graph Tab — Force-directed graph visualization using @antv/g6.
 * Displays entities as nodes grouped by type, with edges showing relationships.
 *
 * @module features/datasets/components/KnowledgeGraphTab
 */

import React, { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Play, RefreshCw, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react'
import {
  useGraphData,
  useGraphMetrics,
  useGraphRAGStatus,
  useRaptorStatus,
  useRunGraphRAG,
  useRunRaptor,
} from '../api/datasetQueries'

/**
 * @description Props for the KnowledgeGraphTab component.
 */
interface KnowledgeGraphTabProps {
  /** Dataset UUID to display graph and RAPTOR data for */
  datasetId: string
}

// Color palette for entity types
const TYPE_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
  '#84cc16', '#a855f7', '#e11d48', '#0ea5e9', '#22c55e',
]

/**
 * @description Get a consistent color for an entity type.
 */
function getTypeColor(type: string, typeMap: Map<string, number>): string {
  if (!typeMap.has(type)) {
    typeMap.set(type, typeMap.size)
  }
  return TYPE_COLORS[typeMap.get(type)! % TYPE_COLORS.length]!
}

/**
 * @description Advanced Task Status Badge showing GraphRAG or RAPTOR status.
 */
function TaskStatusBadge({
  status,
  progress,
  label,
}: {
  status: string
  progress?: number | undefined
  label: string
}) {
  if (status === 'not_started') {
    return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" />{label}: Not started</Badge>
  }
  if (status === 'running') {
    return (
      <Badge variant="secondary" className="gap-1 bg-blue-600 text-white">
        <Loader2 className="h-3 w-3 animate-spin" />
        {label}: {Math.round((progress ?? 0) * 100)}%
      </Badge>
    )
  }
  if (status === 'done') {
    return <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" />{label}: Done</Badge>
  }
  if (status === 'failed') {
    return <Badge variant="destructive" className="gap-1">{label}: Failed</Badge>
  }
  return <Badge variant="outline">{label}: {status}</Badge>
}

/**
 * @description Simple metric display card with label and value.
 * @param {{ label: string; value: string | number }} props - Label text and display value
 * @returns {JSX.Element} Rendered metric card
 */
function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}

/**
 * @description Format an ISO date string to a human-readable relative time or "Never".
 * @param {string | null | undefined} isoDate - ISO date string or null
 * @returns {string} Relative time string or "Never"
 */
function formatLastBuilt(isoDate: string | null | undefined, neverLabel: string): string {
  if (!isoDate) return neverLabel

  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  // Show relative time for recent dates
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  // Show absolute date for older dates
  return date.toLocaleDateString()
}

/**
 * @description Knowledge Graph Tab component.
 * Shows a force-directed graph using Canvas 2D when data exists,
 * or prompts user to run GraphRAG when no graph data is available.
 * Also includes a RAPTOR tab for recursive summarization tasks.
 *
 * @param {KnowledgeGraphTabProps} props - Component properties
 * @returns {JSX.Element} Rendered knowledge graph/RAPTOR tab
 */
const KnowledgeGraphTab: React.FC<KnowledgeGraphTabProps> = ({ datasetId }) => {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activeTab, setActiveTab] = useState<'graph' | 'raptor'>('graph')

  // Data hooks
  const { data: graphData, isLoading: graphLoading, refetch: refetchGraph } = useGraphData(datasetId)
  const { data: graphMetrics } = useGraphMetrics(datasetId)
  const graphRAGStatus = useGraphRAGStatus(datasetId)
  const raptorStatus = useRaptorStatus(datasetId)
  const runGraphRAG = useRunGraphRAG(datasetId)
  const runRaptor = useRunRaptor(datasetId)

  const nodes = graphData?.nodes || []
  const edges = graphData?.edges || []

  // Canvas force-directed graph rendering
  useEffect(() => {
    if (activeTab !== 'graph' || !canvasRef.current || nodes.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const rect = canvas.parentElement?.getBoundingClientRect()
    canvas.width = rect?.width ?? 800
    canvas.height = rect?.height ?? 500

    const typeMap = new Map<string, number>()

    // Initialize node positions with force-directed layout
    const nodePositions = nodes.map((node, i) => ({
      ...node,
      x: canvas.width / 2 + Math.cos(i * 2 * Math.PI / nodes.length) * Math.min(canvas.width, canvas.height) * 0.35,
      y: canvas.height / 2 + Math.sin(i * 2 * Math.PI / nodes.length) * Math.min(canvas.width, canvas.height) * 0.35,
      vx: 0,
      vy: 0,
    }))

    // Create node lookup
    const nodeMap = new Map(nodePositions.map(n => [n.id, n]))

    // Simple force simulation
    let animFrame: number
    let iterations = 0
    const maxIterations = 200

    const simulate = () => {
      if (iterations >= maxIterations) return

      // Repulsive force between all nodes
      for (let i = 0; i < nodePositions.length; i++) {
        for (let j = i + 1; j < nodePositions.length; j++) {
          const a = nodePositions[i]!
          const b = nodePositions[j]!
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = 1000 / (dist * dist)
          const fx = dx / dist * force
          const fy = dy / dist * force
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }

      // Attractive force along edges
      for (const edge of edges) {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target) continue
        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = dist * 0.01
        const fx = dx / dist * force
        const fy = dy / dist * force
        source.vx += fx
        source.vy += fy
        target.vx -= fx
        target.vy -= fy
      }

      // Update positions with damping
      const damping = 0.85
      for (const node of nodePositions) {
        node.vx *= damping
        node.vy *= damping
        node.x += node.vx
        node.y += node.vy
        // Keep within bounds
        node.x = Math.max(30, Math.min(canvas.width - 30, node.x))
        node.y = Math.max(30, Math.min(canvas.height - 30, node.y))
      }

      // Draw
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw edges
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'
      ctx.lineWidth = 1
      for (const edge of edges) {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target) continue
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.stroke()
      }

      // Draw nodes
      for (const node of nodePositions) {
        const color = getTypeColor(node.type, typeMap)
        const radius = 6 + Math.min(node.pagerank * 2, 12)

        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Label
        ctx.font = '10px Inter, system-ui, sans-serif'
        ctx.fillStyle = 'currentColor'
        ctx.textAlign = 'center'
        ctx.fillText(
          node.label.length > 15 ? node.label.slice(0, 15) + '…' : node.label,
          node.x,
          node.y + radius + 12,
        )
      }

      iterations++
      if (iterations < maxIterations) {
        animFrame = requestAnimationFrame(simulate)
      }
    }

    simulate()

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame)
    }
  }, [activeTab, nodes, edges])

  return (
    <div className="space-y-4">
      {/* Header with tab toggle and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm ${activeTab === 'graph' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
              onClick={() => setActiveTab('graph')}
            >
              {t('datasets.knowledgeGraph')}
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${activeTab === 'raptor' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
              onClick={() => setActiveTab('raptor')}
            >
              RAPTOR
            </button>
          </div>

          {/* Status badges */}
          {graphRAGStatus.data && (
            <TaskStatusBadge
              status={graphRAGStatus.data.status}
              progress={graphRAGStatus.data.progress}
              label="GraphRAG"
            />
          )}
          {activeTab === 'raptor' && raptorStatus.data && (
            <TaskStatusBadge
              status={raptorStatus.data.status}
              progress={raptorStatus.data.progress}
              label="RAPTOR"
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'graph' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchGraph()}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                {t('common.refresh')}
              </Button>
              {/* Light mode: faster/cheaper LazyGraphRAG */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => runGraphRAG.mutate({ mode: 'light' })}
                disabled={runGraphRAG.isPending || graphRAGStatus.data?.status === 'running'}
              >
                {runGraphRAG.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                {t('datasets.buildLight')}
              </Button>
              {/* Full mode: entity resolution + community reports */}
              <Button
                size="sm"
                onClick={() => runGraphRAG.mutate({ mode: 'full' })}
                disabled={runGraphRAG.isPending || graphRAGStatus.data?.status === 'running'}
              >
                {runGraphRAG.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-1" />
                )}
                {t('datasets.buildFull')}
              </Button>
            </>
          )}
          {activeTab === 'raptor' && (
            <Button
              size="sm"
                onClick={() => runRaptor.mutate(undefined)}
              disabled={runRaptor.isPending || raptorStatus.data?.status === 'running'}
            >
              {runRaptor.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              {t('datasets.runRaptor')}
            </Button>
          )}
        </div>
      </div>

      {/* GraphRAG Metrics Panel — always visible on graph tab */}
      {activeTab === 'graph' && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label={t('datasets.entityCount')} value={graphMetrics?.entity_count ?? 0} />
            <MetricCard label={t('datasets.relationCount')} value={graphMetrics?.relation_count ?? 0} />
            <MetricCard label={t('datasets.communityCount')} value={graphMetrics?.community_count ?? 0} />
            <MetricCard label={t('datasets.lastBuilt')} value={formatLastBuilt(graphMetrics?.last_built_at, t('datasets.neverBuilt'))} />
          </div>
          {/* Mode explanation */}
          <p className="text-xs text-muted-foreground">
            {t('datasets.lightModeDesc')} · {t('datasets.fullModeDesc')}
          </p>
        </div>
      )}

      {/* Graph content */}
      {activeTab === 'graph' ? (
        graphLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size={32} />
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <EmptyState title={t('datasets.noGraphData')} />
            <p className="text-sm text-muted-foreground max-w-md text-center">
              {t('datasets.noGraphDataDesc')}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg bg-card overflow-hidden relative" style={{ height: 500 }}>
            <canvas ref={canvasRef} className="w-full h-full" />

            {/* Legend */}
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5 max-w-[300px]">
              {Array.from(new Set(nodes.map(n => n.type))).slice(0, 8).map((type, idx) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="text-[10px] gap-1"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[idx % TYPE_COLORS.length] }}
                  />
                  {type}
                </Badge>
              ))}
            </div>

            {/* Stats */}
            <div className="absolute top-3 right-3 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
              {nodes.length} nodes · {edges.length} edges
            </div>
          </div>
        )
      ) : (
        /* RAPTOR tab */
        <div className="space-y-4">
          {raptorStatus.data?.status === 'not_started' ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <EmptyState title={t('datasets.noRaptorData')} />
              <p className="text-sm text-muted-foreground max-w-md text-center">
                {t('datasets.noRaptorDataDesc')}
              </p>
            </div>
          ) : raptorStatus.data?.status === 'running' ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">
                RAPTOR is processing... {Math.round((raptorStatus.data.progress ?? 0) * 100)}%
              </p>
            </div>
          ) : raptorStatus.data?.status === 'done' ? (
            <div className="border rounded-lg p-6 bg-card">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold">{t('datasets.raptorComplete')}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('datasets.raptorCompleteDesc')}
              </p>
            </div>
          ) : raptorStatus.data?.status === 'failed' ? (
            <div className="border rounded-lg p-6 bg-card border-red-200 dark:border-red-900">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <h3 className="font-semibold text-red-600">{t('datasets.raptorFailed')}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {raptorStatus.data?.progress_msg || t('datasets.raptorFailedDesc')}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default KnowledgeGraphTab
