/**
 * @fileoverview Graph statistics overview bar.
 * @description Shows node counts by label and relationship counts by type.
 * Uses theme-aware classes for dark mode support.
 */
import { useTranslation } from 'react-i18next'
import { BarChart3, GitFork } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { CodeGraphStats } from '../types/code-graph.types'

/**
 * @description Props for the GraphStatsBar component
 */
interface GraphStatsBarProps {
  /** Graph statistics data (node/relationship counts) */
  stats: CodeGraphStats | undefined
  /** Whether stats are still loading */
  isLoading: boolean
}

/**
 * @description Horizontal bar showing graph stats (node/rel counts) at the top of the page.
 * Displays total node count, total edge count, and top node type badges.
 * @param {GraphStatsBarProps} props - Component props
 * @returns {JSX.Element} Stats bar with summary badges
 */
const GraphStatsBar = ({ stats, isLoading }: GraphStatsBarProps) => {
  const { t } = useTranslation()

  // Skeleton loading state
  if (isLoading || !stats) {
    return (
      <div className="flex gap-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
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
      {/* Total node count */}
      <Card>
        <CardContent className="p-2 px-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm text-foreground font-medium">
            {totalNodes.toLocaleString()} {t('codeGraph.nodes', 'nodes')}
          </span>
        </CardContent>
      </Card>

      {/* Total relationship count */}
      <Card>
        <CardContent className="p-2 px-3 flex items-center gap-2">
          <GitFork className="h-4 w-4 text-emerald-500" />
          <span className="text-sm text-foreground font-medium">
            {totalRels.toLocaleString()} {t('codeGraph.relationships', 'edges')}
          </span>
        </CardContent>
      </Card>

      {/* Top node type badges sorted by count */}
      {stats.nodes
        .filter((n) => n.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((n) => (
          <Badge
            key={String(n.label)}
            variant="outline"
            className="text-xs"
          >
            {Array.isArray(n.label) ? n.label[0] : n.label}: {n.count}
          </Badge>
        ))}
    </div>
  )
}

export default GraphStatsBar
