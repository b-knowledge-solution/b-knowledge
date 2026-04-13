/**
 * @fileoverview Code Graph visualization page.
 * @description Interactive force-directed graph showing code relationships
 * for a knowledge base. Accessed from project pages with category "code".
 * Supports dark mode via class-based theming.
 */
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Network, RefreshCw, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildAdminKnowledgeBasePath } from '@/app/adminRoutes'
import { useCodeGraphStats, useCodeGraphData } from '../api/codeGraphQueries'
import ForceGraph from '../components/ForceGraph'
import GraphControls from '../components/GraphControls'
import NodeDetailPanel from '../components/NodeDetailPanel'
import GraphStatsBar from '../components/GraphStatsBar'
import type { CodeGraphNode } from '../types/code-graph.types'

/**
 * @description Full-page code graph visualization.
 * Uses the kbId from URL params to fetch graph data
 * and render an interactive force-directed layout with controls, export, and NL query.
 * @returns {JSX.Element} Rendered code graph page
 */
const CodeGraphPage = () => {
  const { t } = useTranslation()
  const { kbId } = useParams<{ kbId: string }>()
  const [selectedNode, setSelectedNode] = useState<CodeGraphNode | null>(null)
  const [nodeLimit, setNodeLimit] = useState(500)
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<number>>(new Set())
  const [visibleLabels, setVisibleLabels] = useState<Set<string>>(new Set())

  const { data: stats, isLoading: loadingStats } = useCodeGraphStats(kbId || '')
  const { data: graphData, isLoading: loadingGraph, refetch } = useCodeGraphData(kbId || '', nodeLimit)

  /**
   * @description Handle node click in the graph to show details in side panel
   * @param {CodeGraphNode} node - The clicked graph node
   */
  const handleNodeClick = (node: CodeGraphNode) => {
    setSelectedNode(node)
  }

  /**
   * @description Handle NL query results by highlighting matching node IDs
   * @param {number[]} nodeIds - Array of node IDs returned by the NL query
   */
  const handleQueryResult = (nodeIds: number[]) => {
    setHighlightedNodeIds(new Set(nodeIds))
  }

  // Filter nodes and links based on visible label filters
  const filteredNodes = graphData?.nodes?.filter((node) => {
    // Show all if no filter active
    if (visibleLabels.size === 0) return true
    return node.labels?.some((label) => visibleLabels.has(label))
  }) ?? []

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id))
  const filteredLinks = graphData?.links?.filter(
    (link) => filteredNodeIds.has(link.source) && filteredNodeIds.has(link.target)
  ) ?? []

  // Guard: no kbId in URL params
  if (!kbId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>{t('codeGraph.noKbSelected', 'No knowledge base selected')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3 p-4 bg-background">
      {/* Top bar: back link + title + controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link to={buildAdminKnowledgeBasePath(kbId)}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Network className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">
            {t('codeGraph.title', 'Code Graph')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Node limit selector */}
          <select
            value={nodeLimit}
            onChange={(e) => setNodeLimit(Number(e.target.value))}
            className="bg-muted border border-border text-foreground rounded px-2 py-1 text-sm"
          >
            <option value={100}>100 {t('codeGraph.nodes', 'nodes')}</option>
            <option value={250}>250 {t('codeGraph.nodes', 'nodes')}</option>
            <option value={500}>500 {t('codeGraph.nodes', 'nodes')}</option>
            <option value={1000}>1000 {t('codeGraph.nodes', 'nodes')}</option>
            <option value={2000}>2000 {t('codeGraph.nodes', 'nodes')}</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={loadingGraph}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loadingGraph ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <GraphStatsBar stats={stats} isLoading={loadingStats} />

      {/* Main content: graph + detail panel */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left column: graph canvas + controls */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {/* Graph canvas */}
          <div className="flex-1 relative min-h-0">
            {loadingGraph ? (
              <div className="flex items-center justify-center h-full bg-muted/50 rounded-lg border border-border">
                <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              </div>
            ) : filteredNodes.length ? (
              <ForceGraph
                nodes={filteredNodes}
                links={filteredLinks}
                onNodeClick={handleNodeClick}
                highlightedNodeIds={highlightedNodeIds}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-muted/50 rounded-lg border border-border text-muted-foreground">
                <Network className="h-12 w-12 mb-2 opacity-30" />
                <p>{t('codeGraph.noData', 'No graph data available. Upload code files to populate the graph.')}</p>
              </div>
            )}
          </div>

          {/* Graph controls: NL query, filters, export */}
          <GraphControls
            kbId={kbId}
            graphData={{ nodes: filteredNodes, links: filteredLinks }}
            stats={stats}
            visibleLabels={visibleLabels}
            onVisibleLabelsChange={setVisibleLabels}
            onQueryResult={handleQueryResult}
            canvasSelector="canvas"
          />
        </div>

        {/* Right panel: node details */}
        {selectedNode && (
          <div className="w-80 shrink-0">
            <NodeDetailPanel
              node={selectedNode}
              kbId={kbId}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default CodeGraphPage
