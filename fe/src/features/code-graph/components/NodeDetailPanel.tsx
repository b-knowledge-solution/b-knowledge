/**
 * Node detail panel showing callers, callees, and code snippet.
 * @description Displayed when clicking a node in the graph visualization.
 */
import { useTranslation } from 'react-i18next'
import { Code2, ArrowUpRight, ArrowDownLeft, GitBranch } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useCodeGraphCallers, useCodeGraphCallees, useCodeGraphSnippet } from '../api/codeGraphQueries'
import type { CodeGraphNode } from '../types/code-graph.types'

/** Props for NodeDetailPanel */
interface NodeDetailPanelProps {
  node: CodeGraphNode
  kbId: string
}

/**
 * Panel displaying details for a selected graph node.
 * @param props - Component props
 */
const NodeDetailPanel = ({ node, kbId }: NodeDetailPanelProps) => {
  const { t } = useTranslation()
  const { data: callers, isLoading: loadingCallers } = useCodeGraphCallers(kbId, node.name)
  const { data: callees, isLoading: loadingCallees } = useCodeGraphCallees(kbId, node.name)
  const { data: snippets, isLoading: loadingSnippet } = useCodeGraphSnippet(kbId, node.name)

  const labels = node.labels || []
  const snippet = snippets?.[0]

  return (
    <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* Node Header */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono text-slate-100 flex items-center gap-2">
            <Code2 className="h-4 w-4 text-blue-400" />
            {node.qualified_name || node.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="text-xs">
                {label}
              </Badge>
            ))}
            {node.language && (
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-600">
                {node.language}
              </Badge>
            )}
          </div>
          {node.path && (
            <p className="text-xs text-slate-400 truncate" title={node.path}>
              {node.path}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Callers */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-1 text-slate-300">
            <ArrowDownLeft className="h-3 w-3 text-green-400" />
            {t('codeGraph.callers', 'Callers')} ({callers?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingCallers ? (
            <Skeleton className="h-8 w-full" />
          ) : callers?.length ? (
            <ul className="space-y-1">
              {callers.slice(0, 10).map((ref, i) => (
                <li key={i} className="text-xs font-mono text-blue-300 truncate" title={ref.caller}>
                  {ref.caller}
                </li>
              ))}
              {callers.length > 10 && (
                <li className="text-xs text-slate-500">+{callers.length - 10} more</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">{t('codeGraph.noCallers', 'No callers found')}</p>
          )}
        </CardContent>
      </Card>

      {/* Callees */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs flex items-center gap-1 text-slate-300">
            <ArrowUpRight className="h-3 w-3 text-amber-400" />
            {t('codeGraph.callees', 'Callees')} ({callees?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingCallees ? (
            <Skeleton className="h-8 w-full" />
          ) : callees?.length ? (
            <ul className="space-y-1">
              {callees.slice(0, 10).map((ref, i) => (
                <li key={i} className="text-xs font-mono text-purple-300 truncate" title={ref.callee}>
                  {ref.callee}
                </li>
              ))}
              {callees.length > 10 && (
                <li className="text-xs text-slate-500">+{callees.length - 10} more</li>
              )}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">{t('codeGraph.noCallees', 'No callees found')}</p>
          )}
        </CardContent>
      </Card>

      {/* Code Snippet */}
      {(loadingSnippet || snippet) && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-1 text-slate-300">
              <GitBranch className="h-3 w-3 text-cyan-400" />
              {t('codeGraph.sourceCode', 'Source Code')}
              {snippet && (
                <span className="text-slate-500 ml-1">
                  L{snippet.start_line}-{snippet.end_line}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingSnippet ? (
              <Skeleton className="h-32 w-full" />
            ) : snippet?.code ? (
              <pre className="text-xs font-mono text-slate-300 bg-slate-900 p-2 rounded overflow-x-auto max-h-64 whitespace-pre-wrap">
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
