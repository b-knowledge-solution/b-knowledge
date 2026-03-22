/**
 * @fileoverview Command palette (Cmd+K) for adding operator nodes to the agent canvas.
 * Groups operators by category with search/filter, icons, and descriptions.
 *
 * @module features/agents/components/canvas/NodePalette
 */

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useCanvasStore } from '../../store/canvasStore'
import {
  NODE_CATEGORY_COLORS,
  type OperatorType,
  type NodeCategory,
} from '../../types/agent.types'

/**
 * @description Props for the NodePalette component
 */
interface NodePaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * @description Operator entry definition for the palette list
 */
interface OperatorEntry {
  type: OperatorType
  name: string
  description: string
  category: NodeCategory
}

/**
 * @description All available operators grouped by category with display names and descriptions
 */
const OPERATORS: OperatorEntry[] = [
  // Input/Output
  { type: 'begin', name: 'Begin', description: 'Starting point of the workflow', category: 'input-output' },
  { type: 'answer', name: 'Answer', description: 'Final response output', category: 'input-output' },
  { type: 'message', name: 'Message', description: 'Send a message to the user', category: 'input-output' },
  // LLM/AI
  { type: 'generate', name: 'Generate', description: 'LLM text generation', category: 'llm-ai' },
  { type: 'categorize', name: 'Categorize', description: 'Classify input into categories', category: 'llm-ai' },
  { type: 'rewrite', name: 'Rewrite', description: 'Rewrite or rephrase text', category: 'llm-ai' },
  { type: 'relevant', name: 'Relevant', description: 'Check content relevance', category: 'llm-ai' },
  // Retrieval
  { type: 'retrieval', name: 'Retrieval', description: 'Search knowledge base', category: 'retrieval' },
  { type: 'wikipedia', name: 'Wikipedia', description: 'Search Wikipedia', category: 'retrieval' },
  { type: 'tavily', name: 'Tavily', description: 'Web search via Tavily', category: 'retrieval' },
  { type: 'pubmed', name: 'PubMed', description: 'Search medical literature', category: 'retrieval' },
  // Logic/Flow
  { type: 'switch', name: 'Switch', description: 'Conditional branching', category: 'logic-flow' },
  { type: 'condition', name: 'Condition', description: 'If/else condition check', category: 'logic-flow' },
  { type: 'loop', name: 'Loop', description: 'Iterate over items', category: 'logic-flow' },
  { type: 'merge', name: 'Merge', description: 'Merge parallel branches', category: 'logic-flow' },
  { type: 'concentrator', name: 'Concentrator', description: 'Aggregate multiple inputs', category: 'logic-flow' },
  { type: 'note', name: 'Note', description: 'Annotation note (no execution)', category: 'logic-flow' },
  // Code/Tool
  { type: 'code', name: 'Code', description: 'Execute custom code', category: 'code-tool' },
  { type: 'github', name: 'GitHub', description: 'GitHub API integration', category: 'code-tool' },
  { type: 'sql', name: 'SQL', description: 'Execute SQL queries', category: 'code-tool' },
  { type: 'api', name: 'API', description: 'Call external REST API', category: 'code-tool' },
  { type: 'email', name: 'Email', description: 'Send email', category: 'code-tool' },
  { type: 'invoke', name: 'Invoke', description: 'Invoke another agent', category: 'code-tool' },
  // Data
  { type: 'template', name: 'Template', description: 'Text template with variables', category: 'data' },
  { type: 'keyword_extract', name: 'Keyword Extract', description: 'Extract keywords from text', category: 'data' },
  { type: 'crawler', name: 'Crawler', description: 'Crawl web pages', category: 'data' },
  { type: 'google', name: 'Google Search', description: 'Search via Google', category: 'data' },
  { type: 'bing', name: 'Bing Search', description: 'Search via Bing', category: 'data' },
  { type: 'duckduckgo', name: 'DuckDuckGo', description: 'Search via DuckDuckGo', category: 'data' },
  { type: 'baidu', name: 'Baidu', description: 'Search via Baidu', category: 'data' },
  { type: 'google_scholar', name: 'Google Scholar', description: 'Search academic papers', category: 'data' },
  { type: 'arxiv', name: 'arXiv', description: 'Search arXiv papers', category: 'data' },
  { type: 'deepl', name: 'DeepL', description: 'Translate text', category: 'data' },
  { type: 'qweather', name: 'QWeather', description: 'Weather data', category: 'data' },
  { type: 'exesql', name: 'Execute SQL', description: 'Run SQL on connected DB', category: 'data' },
  { type: 'akshare', name: 'AKShare', description: 'Financial data (China)', category: 'data' },
  { type: 'yahoofinance', name: 'Yahoo Finance', description: 'Stock market data', category: 'data' },
  { type: 'jin10', name: 'Jin10', description: 'Financial news feed', category: 'data' },
  { type: 'tushare', name: 'TuShare', description: 'China market data', category: 'data' },
  { type: 'wencai', name: 'Wencai', description: 'Stock screening tool', category: 'data' },
]

/**
 * @description Category display labels for grouping in the palette
 */
const CATEGORY_LABELS: Record<NodeCategory, string> = {
  'input-output': 'Input / Output',
  'llm-ai': 'LLM / AI',
  'retrieval': 'Retrieval',
  'logic-flow': 'Logic / Flow',
  'code-tool': 'Code / Tool',
  'data': 'Data',
}

/**
 * @description Category display order
 */
const CATEGORY_ORDER: NodeCategory[] = [
  'input-output', 'llm-ai', 'retrieval', 'logic-flow', 'code-tool', 'data',
]

/**
 * @description Command palette dialog for adding new operator nodes to the canvas.
 * Opens with Cmd+K, provides search filtering, and groups operators by category.
 * Selecting an operator adds a new node at the canvas center.
 *
 * @param {NodePaletteProps} props - Open state and change handler
 * @returns {JSX.Element} Dialog with searchable operator list grouped by category
 */
export function NodePalette({ open, onOpenChange }: NodePaletteProps) {
  const { t } = useTranslation()
  const addNode = useCanvasStore((s) => s.addNode)
  const [search, setSearch] = useState('')

  // Filter operators by search query (case-insensitive)
  const filtered = search.trim()
    ? OPERATORS.filter(
        (op) =>
          op.name.toLowerCase().includes(search.toLowerCase()) ||
          op.type.toLowerCase().includes(search.toLowerCase())
      )
    : OPERATORS

  // Group filtered operators by category
  const grouped = CATEGORY_ORDER.reduce<Record<NodeCategory, OperatorEntry[]>>(
    (acc, cat) => {
      const items = filtered.filter((op) => op.category === cat)
      if (items.length > 0) {
        acc[cat] = items
      }
      return acc
    },
    {} as Record<NodeCategory, OperatorEntry[]>
  )

  /**
   * @description Handles operator selection: creates a new node at canvas center
   * @param {OperatorEntry} op - The selected operator entry
   */
  const handleSelect = useCallback(
    (op: OperatorEntry) => {
      const id = uuidv4()
      // Place new nodes near the center with slight random offset to avoid stacking
      const offset = Math.random() * 100 - 50
      addNode({
        id,
        type: 'canvasNode',
        position: { x: 400 + offset, y: 300 + offset },
        data: {
          type: op.type,
          label: op.name,
          config: {},
        },
      })
      onOpenChange(false)
      setSearch('')
    },
    [addNode, onOpenChange]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        {/* Search input */}
        <div className="p-3 border-b">
          <Input
            placeholder={t('agents.searchPlaceholder', 'Search operators...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Grouped operator list */}
        <ScrollArea className="max-h-[400px]">
          <div className="p-2">
            {Object.entries(grouped).map(([category, items]) => {
              const cat = category as NodeCategory
              const colors = NODE_CATEGORY_COLORS[cat]
              return (
                <div key={cat} className="mb-3">
                  {/* Category header */}
                  <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                    {CATEGORY_LABELS[cat]}
                  </div>
                  {/* Operator items */}
                  {items.map((op) => (
                    <button
                      key={op.type}
                      className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-accent text-left"
                      onClick={() => handleSelect(op)}
                    >
                      {/* Category color dot */}
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: colors.light }}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{op.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {op.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            })}

            {/* Empty state when no operators match search */}
            {Object.keys(grouped).length === 0 && (
              <div className="text-center text-muted-foreground py-6 text-sm">
                No operators found
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
