/**
 * @fileoverview Node detail panel showing callers, callees, and code snippet.
 * @description Displayed when clicking a node in the graph visualization.
 * Shows qualified name, type badges, file path, source code, and caller/callee lists.
 * Supports dark mode via theme-aware classes.
 */
import { useTranslation } from 'react-i18next'
import { Code2, ArrowUpRight, ArrowDownLeft, GitBranch, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCodeGraphCallers, useCodeGraphCallees, useCodeGraphSnippet } from '../api/codeGraphQueries'
import type { CodeGraphNode } from '../types/code-graph.types'

/**
 * @description Props for NodeDetailPanel
 */
interface NodeDetailPanelProps {
  /** The selected graph node to display details for */
  node: CodeGraphNode
  /** Knowledge base ID for API calls */
  kbId: string
  /** Callback to close the panel */
  onClose?: () => void
}

/**
 * @description Panel displaying details for a selected graph node.
 * Fetches callers, callees, and source code snippet from the API.
 * @param {NodeDetailPanelProps} props - Component props
 * @returns {JSX.Element} Detail panel with node info, callers, callees, and code
 */
const NodeDetailPanel = ({ node, kbId, onClose }: NodeDetailPanelProps) => {
  const { t } = useTranslation()
  const { data: callers, isLoading: loadingCallers } = useCodeGraphCallers(kbId, node.name)
  const { data: callees, isLoading: loadingCallees } = useCodeGraphCallees(kbId, node.name)
  const { data: snippets, isLoading: loadingSnippet } = useCodeGraphSnippet(kbId, node.name)

  const labels = node.labels || []
  const snippet = snippets?.[0]

  return (
    <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* Node header with close button */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono text-foreground flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              {node.qualified_name || node.name}
            </CardTitle>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {/* Type and language badges */}
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
            {node.language && (
              <Badge variant="outline" className="text-xs text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-600">
                {node.language}
              </Badge>
            )}
          </div>
          {/* File path */}
          {node.path && (
            <p className="text-xs text-muted-foreground truncate" title={node.path}>
              {node.path}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Callers section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
            <ArrowDownLeft className="h-3 w-3 text-green-500" />
            {t('codeGraph.callers', 'Callers')} ({callers?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingCallers ? (
            <Skeleton className="h-8 w-full" />
          ) : callers?.length ? (
            <ul className="space-y-1">
              {callers.slice(0, 10).map((ref, i) => (
                <li key={i} className="text-xs font-mono text-primary truncate" title={ref.caller}>
                  {ref.caller}
                </li>
              ))}
              {/* Overflow indicator */}
              {callers.length > 10 && (
                <li className="text-xs text-muted-foreground">+{callers.length - 10} more</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('codeGraph.noCallers', 'No callers found')}</p>
          )}
        </CardContent>
      </Card>

      {/* Callees section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
            <ArrowUpRight className="h-3 w-3 text-amber-500" />
            {t('codeGraph.callees', 'Callees')} ({callees?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingCallees ? (
            <Skeleton className="h-8 w-full" />
          ) : callees?.length ? (
            <ul className="space-y-1">
              {callees.slice(0, 10).map((ref, i) => (
                <li key={i} className="text-xs font-mono text-purple-600 dark:text-purple-400 truncate" title={ref.callee}>
                  {ref.callee}
                </li>
              ))}
              {/* Overflow indicator */}
              {callees.length > 10 && (
                <li className="text-xs text-muted-foreground">+{callees.length - 10} more</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('codeGraph.noCallees', 'No callees found')}</p>
          )}
        </CardContent>
      </Card>

      {/* Code snippet section */}
      {(loadingSnippet || snippet) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
              <GitBranch className="h-3 w-3 text-cyan-500" />
              {t('codeGraph.sourceCode', 'Source Code')}
              {snippet && (
                <span className="text-muted-foreground/60 ml-1">
                  L{snippet.start_line}-{snippet.end_line}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingSnippet ? (
              <Skeleton className="h-32 w-full" />
            ) : snippet?.code ? (
              <pre className="text-xs font-mono text-foreground bg-muted p-2 rounded overflow-x-auto max-h-64 whitespace-pre-wrap">
                {snippet.code}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default NodeDetailPanel
