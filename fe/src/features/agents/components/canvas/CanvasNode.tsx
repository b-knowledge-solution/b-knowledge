/**
 * @fileoverview Generic node renderer for all operator types on the agent canvas.
 * Displays category-colored border, icon, title, type label, and input/output handles.
 *
 * @module features/agents/components/canvas/CanvasNode
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Play,
  MessageSquare,
  Mail,
  Brain,
  GitBranch,
  Search,
  Code,
  Database,
  Globe,
  Repeat,
  Merge,
  StickyNote,
  Zap,
  FileText,
  ArrowRightLeft,
  type LucideIcon,
} from 'lucide-react'
import {
  NODE_CATEGORY_MAP,
  NODE_CATEGORY_COLORS,
  type OperatorType,
  type NodeCategory,
} from '../../types/agent.types'

/**
 * @description Data payload attached to each canvas node
 */
interface CanvasNodeData {
  type: OperatorType
  label: string
  config: Record<string, unknown>
  [key: string]: unknown
}

/**
 * @description Maps operator types to their lucide-react icon component
 * @param {OperatorType} type - The operator type to get an icon for
 * @returns {LucideIcon} The corresponding icon component
 */
function getNodeIcon(type: OperatorType): LucideIcon {
  const iconMap: Partial<Record<OperatorType, LucideIcon>> = {
    begin: Play,
    answer: MessageSquare,
    message: MessageSquare,
    generate: Brain,
    categorize: GitBranch,
    rewrite: ArrowRightLeft,
    relevant: Search,
    retrieval: Search,
    wikipedia: Globe,
    tavily: Globe,
    pubmed: Globe,
    switch: GitBranch,
    condition: GitBranch,
    loop: Repeat,
    merge: Merge,
    note: StickyNote,
    code: Code,
    github: Code,
    sql: Database,
    api: Zap,
    email: Mail,
    template: FileText,
    keyword_extract: FileText,
    crawler: Globe,
  }
  return iconMap[type] ?? Zap
}

/**
 * @description Determines if a node type has multiple output handles (switch/categorize)
 * @param {OperatorType} type - Node operator type
 * @returns {boolean} True if the node has multiple outputs
 */
function hasMultipleOutputs(type: OperatorType): boolean {
  return type === 'switch' || type === 'categorize'
}

/**
 * @description Generic canvas node renderer used for all operator types.
 * Renders a card with category-colored left border, icon, title, type label,
 * and input/output port handles. Supports dark mode and accessibility labels.
 *
 * @param {NodeProps} props - ReactFlow node props containing data, selected state, and ID
 * @returns {JSX.Element} Rendered node card with handles
 */
export const CanvasNode = memo(function CanvasNode({ data, selected }: NodeProps) {
  const nodeData = data as CanvasNodeData
  const category: NodeCategory = NODE_CATEGORY_MAP[nodeData.type] ?? 'data'
  const colors = NODE_CATEGORY_COLORS[category]
  const Icon = getNodeIcon(nodeData.type)

  // Determine border color based on selection state and theme
  const borderColor = selected ? 'var(--accent-border, #0D26CF)' : colors.light

  return (
    <div
      className="bg-card border rounded-lg shadow-sm min-w-[180px] min-h-[44px] relative"
      style={{ borderLeft: `4px solid ${borderColor}` }}
      aria-label={`${nodeData.type}: ${nodeData.label}`}
    >
      {/* Input handle (left side) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
      />

      {/* Node content */}
      <div className="px-3 py-2 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          {/* Node title */}
          <div className="text-sm font-semibold truncate leading-tight">
            {nodeData.label}
          </div>
          {/* Node type label */}
          <div className="text-xs text-muted-foreground opacity-70 truncate">
            {nodeData.type}
          </div>
        </div>
      </div>

      {/* Output handle(s) (right side) */}
      {hasMultipleOutputs(nodeData.type) ? (
        <>
          {/* Default output handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="default"
            className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
            style={{ top: '33%' }}
          />
          {/* Secondary output handle for conditional branches */}
          <Handle
            type="source"
            position={Position.Right}
            id="alternate"
            className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
            style={{ top: '66%' }}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
        />
      )}
    </div>
  )
})
