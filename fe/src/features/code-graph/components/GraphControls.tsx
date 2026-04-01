/**
 * @fileoverview Graph control panel with NL query, node type filters, and export buttons.
 * @description Provides interactive controls below the graph canvas:
 * - Natural language query input for AI-powered Cypher translation
 * - Node type filter checkboxes to show/hide by label
 * - Export buttons: PNG image, SVG image, JSON graph data
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, ImageIcon, FileJson, Filter, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { useCodeGraphQuery } from '../api/codeGraphQueries'
import type { CodeGraphData, CodeGraphStats } from '../types/code-graph.types'

/** All possible node labels for filtering */
const ALL_LABELS = [
  'Function', 'Method', 'Class', 'Module', 'Package',
  'Interface', 'Enum', 'Struct', 'Trait', 'Type', 'Folder', 'Project',
]

/**
 * @description Props for GraphControls component
 */
interface GraphControlsProps {
  /** Knowledge base ID for NL query endpoint */
  kbId: string
  /** Current graph data for JSON export */
  graphData: CodeGraphData
  /** Graph stats for extracting available node labels */
  stats: CodeGraphStats | undefined
  /** Currently visible label filters (empty = show all) */
  visibleLabels: Set<string>
  /** Callback when visible label filters change */
  onVisibleLabelsChange: (labels: Set<string>) => void
  /** Callback when NL query returns node IDs for highlighting */
  onQueryResult: (nodeIds: number[]) => void
  /** CSS selector for the canvas element (for PNG export) */
  canvasSelector: string
}

/**
 * @description Control panel for the code graph page.
 * Contains NL query input, filter popover, and export buttons.
 * @param {GraphControlsProps} props - Component props
 * @returns {JSX.Element} Rendered control bar
 */
const GraphControls = ({
  kbId,
  graphData,
  stats,
  visibleLabels,
  onVisibleLabelsChange,
  onQueryResult,
  canvasSelector,
}: GraphControlsProps) => {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const nlQuery = useCodeGraphQuery(kbId)

  // Collect available labels from stats (only show labels that actually exist in the graph)
  const availableLabels = stats?.nodes
    ?.filter((n) => n.count > 0)
    .map((n) => (Array.isArray(n.label) ? n.label[0] : n.label))
    .filter((label): label is string => !!label) ?? []

  /**
   * @description Submit the NL query to the backend for AI-powered Cypher translation
   */
  const handleQuerySubmit = () => {
    if (!query.trim()) return
    nlQuery.mutate(query.trim(), {
      onSuccess: (result) => {
        // Highlight matching nodes in the graph
        onQueryResult(result.nodeIds ?? [])
      },
    })
  }

  /**
   * @description Toggle a node label in the visible filter set
   * @param {string} label - Node label to toggle
   */
  const toggleLabel = (label: string) => {
    const next = new Set(visibleLabels)
    if (next.has(label)) {
      next.delete(label)
    } else {
      next.add(label)
    }
    onVisibleLabelsChange(next)
  }

  /**
   * @description Clear all label filters to show all node types
   */
  const clearFilters = () => {
    onVisibleLabelsChange(new Set())
  }

  /**
   * @description Export the graph canvas as a PNG image
   */
  const exportPng = () => {
    const canvas = document.querySelector(canvasSelector) as HTMLCanvasElement | null
    if (!canvas) return

    // Convert canvas to blob and trigger download
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `code-graph-${kbId}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  /**
   * @description Export the current graph data as a JSON file
   */
  const exportJson = () => {
    const json = JSON.stringify(graphData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `code-graph-${kbId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-muted/30 border border-border rounded-lg">
      {/* NL query input */}
      <div className="flex-1 min-w-[200px] flex gap-1">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Submit on Enter key press
            if (e.key === 'Enter') handleQuerySubmit()
          }}
          placeholder={t('codeGraph.queryPlaceholder', 'Ask about the code graph...')}
          className="h-8 text-sm"
        />
        <Button
          variant="default"
          size="sm"
          className="h-8 px-3"
          onClick={handleQuerySubmit}
          disabled={nlQuery.isPending || !query.trim()}
        >
          {nlQuery.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* NL query error display */}
      {nlQuery.isError && (
        <span className="text-xs text-destructive">
          {t('codeGraph.queryError', 'Query failed')}
        </span>
      )}

      {/* NL query result count */}
      {nlQuery.data && (
        <Badge variant="secondary" className="text-xs">
          {nlQuery.data.count} {t('codeGraph.results', 'results')}
        </Badge>
      )}

      {/* Filter popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <Filter className="h-3.5 w-3.5" />
            {t('codeGraph.filter', 'Filter')}
            {/* Show active filter count badge */}
            {visibleLabels.size > 0 && (
              <Badge variant="default" className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                {visibleLabels.size}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-3" align="end">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('codeGraph.nodeTypes', 'Node Types')}
              </span>
              {/* Clear all filters button */}
              {visibleLabels.size > 0 && (
                <Button variant="ghost" size="sm" className="h-5 text-xs px-1" onClick={clearFilters}>
                  {t('common.clearAll', 'Clear')}
                </Button>
              )}
            </div>
            {/* Label checkboxes */}
            {(availableLabels.length > 0 ? availableLabels : ALL_LABELS).map((label) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={visibleLabels.size === 0 || visibleLabels.has(label)}
                  onCheckedChange={() => toggleLabel(label)}
                />
                <span className="text-xs">{label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Export buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={exportPng}
          title={t('codeGraph.exportPng', 'Export PNG')}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">PNG</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1"
          onClick={exportJson}
          title={t('codeGraph.exportJson', 'Export JSON')}
        >
          <FileJson className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">JSON</span>
        </Button>
      </div>
    </div>
  )
}

export default GraphControls
