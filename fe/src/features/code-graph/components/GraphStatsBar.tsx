/**
 * Graph statistics overview cards.
 * @description Shows node counts by label and relationship counts by type.
 */
import { useTranslation } from 'react-i18next'
import { BarChart3, GitFork } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CodeGraphStats } from '../types/code-graph.types'

/** Props for GraphStatsBar */
interface GraphStatsBarProps {
  stats: CodeGraphStats | undefined
  isLoading: boolean
}

/**
 * Horizontal bar showing graph stats (node/rel counts) at the top of the page.
 * @param props - Component props
 */
const GraphStatsBar = ({ stats, isLoading }: GraphStatsBarProps) => {
  const { t } = useTranslation()

  if (isLoading || !stats) {
    return (
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-slate-800 border-slate-700 animate-pulse">
            <CardContent className="p-3 h-12" />
          </Card>
        ))}
      </div>
    )
  }

  const totalNodes = stats.nodes.reduce((sum, n) => sum + n.count, 0)
  const totalRels = stats.relationships.reduce((sum, r) => sum + r.count, 0)

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Total nodes */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-2 px-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-400" />
          <span className="text-sm text-slate-200 font-medium">
            {totalNodes.toLocaleString()} {t('codeGraph.nodes', 'nodes')}
          </span>
        </CardContent>
      </Card>

      {/* Total relationships */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-2 px-3 flex items-center gap-2">
          <GitFork className="h-4 w-4 text-emerald-400" />
          <span className="text-sm text-slate-200 font-medium">
            {totalRels.toLocaleString()} {t('codeGraph.relationships', 'edges')}
          </span>
        </CardContent>
      </Card>

      {/* Node type badges */}
      {stats.nodes
        .filter((n) => n.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((n) => (
          <Badge
            key={String(n.label)}
            variant="outline"
            className="text-xs text-slate-300 border-slate-600"
          >
            {Array.isArray(n.label) ? n.label[0] : n.label}: {n.count}
          </Badge>
        ))}
    </div>
  )
}

export default GraphStatsBar
