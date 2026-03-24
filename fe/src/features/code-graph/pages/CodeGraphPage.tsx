/**
 * Code Graph visualization page.
 * @description Interactive force-directed graph showing code relationships
 * for a knowledge base. Accessed from project pages with category "code".
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Network, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCodeGraphStats, useCodeGraphData } from '../api/codeGraphQueries'
import ForceGraph from '../components/ForceGraph'
import NodeDetailPanel from '../components/NodeDetailPanel'
import GraphStatsBar from '../components/GraphStatsBar'
import type { CodeGraphNode } from '../types/code-graph.types'

/**
 * Full-page code graph visualization.
 * @description Uses the kbId from URL params to fetch graph data
 * and render an interactive force-directed layout.
 */
const CodeGraphPage = () => {
  const { t } = useTranslation()
  const { kbId } = useParams<{ kbId: string }>()
  const [selectedNode, setSelectedNode] = useState<CodeGraphNode | null>(null)
  const [nodeLimit, setNodeLimit] = useState(500)

  const { data: stats, isLoading: loadingStats } = useCodeGraphStats(kbId || '')
  const { data: graphData, isLoading: loadingGraph, refetch } = useCodeGraphData(kbId || '', nodeLimit)

  const handleNodeClick = (node: CodeGraphNode) => {
    setSelectedNode(node)
  }

  if (!kbId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p>{t('codeGraph.noKbSelected', 'No knowledge base selected')}</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3 p-4">
      {/* Top bar: title + stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-slate-100">
            {t('codeGraph.title', 'Code Graph')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={nodeLimit}
            onChange={(e) => setNodeLimit(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 text-slate-200 rounded px-2 py-1 text-sm"
          >
            <option value={100}>100 nodes</option>
            <option value={250}>250 nodes</option>
            <option value={500}>500 nodes</option>
            <option value={1000}>1000 nodes</option>
            <option value={2000}>2000 nodes</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={loadingGraph}
            className="border-slate-600 text-slate-300"
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
        {/* Graph canvas */}
        <div className="flex-1 relative">
          {loadingGraph ? (
            <div className="flex items-center justify-center h-full bg-slate-900 rounded-lg border border-slate-700">
              <RefreshCw className="h-8 w-8 text-blue-400 animate-spin" />
            </div>
          ) : graphData?.nodes?.length ? (
            <ForceGraph
              nodes={graphData.nodes}
              links={graphData.links}
              onNodeClick={handleNodeClick}
              width={selectedNode ? 900 : 1200}
              height={600}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-slate-900 rounded-lg border border-slate-700 text-slate-500">
              <Network className="h-12 w-12 mb-2 opacity-30" />
              <p>{t('codeGraph.noData', 'No graph data available. Upload code files to populate the graph.')}</p>
            </div>
          )}
        </div>

        {/* Detail panel (right side) */}
        {selectedNode && kbId && (
          <div className="w-80 shrink-0">
            <NodeDetailPanel node={selectedNode} kbId={kbId} />
          </div>
        )}
      </div>
    </div>
  )
}

export default CodeGraphPage
