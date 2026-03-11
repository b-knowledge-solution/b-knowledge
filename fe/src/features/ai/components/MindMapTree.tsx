/**
 * @fileoverview Recursive mind map tree visualization component.
 * @module features/ai/components/MindMapTree
 */

import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MindMapNode } from '../types/search.types'

// ============================================================================
// Props
// ============================================================================

interface MindMapTreeNodeProps {
  /** The node data to render */
  node: MindMapNode
  /** Nesting depth level (0 = root) */
  depth: number
  /** Whether this node should be expanded by default */
  defaultExpanded?: boolean
}

interface MindMapTreeProps {
  /** Root node of the mind map */
  data: MindMapNode
}

// ============================================================================
// Tree Node
// ============================================================================

/**
 * @description Renders a single tree node with expand/collapse toggle
 * and recursively renders children.
 * @param props - Node props including data, depth, and default expansion state
 * @returns The rendered tree node element
 */
function MindMapTreeNode({ node, depth, defaultExpanded = false }: MindMapTreeNodeProps) {
  // Track whether children are visible
  const [expanded, setExpanded] = useState(defaultExpanded)

  // Whether this node has children to expand
  const hasChildren = node.children && node.children.length > 0

  return (
    <div className="select-none">
      {/* Node row */}
      <div
        className={cn(
          'flex items-center gap-1.5 py-1 px-1 rounded-md cursor-pointer',
          'hover:bg-muted/60 transition-colors',
          depth === 0 && 'font-semibold text-base',
          depth === 1 && 'text-sm font-medium',
          depth >= 2 && 'text-sm',
        )}
        onClick={() => hasChildren && setExpanded(!expanded)}
        role={hasChildren ? 'button' : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        {/* Expand/collapse icon or spacer */}
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="inline-block w-4 shrink-0" />
        )}

        {/* Node label */}
        <span className="text-foreground">{node.label}</span>
      </div>

      {/* Children (indented with a connecting border line) */}
      {hasChildren && expanded && (
        <div className="ml-2 pl-3 border-l border-border">
          {node.children!.map((child, index) => (
            <MindMapTreeNode
              key={`${child.label}-${index}`}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * @description Renders a hierarchical mind map as an expandable tree.
 * Root node is expanded by default; all children start collapsed.
 * @param props - Props containing the root mind map node data
 * @returns The rendered mind map tree
 */
function MindMapTree({ data }: MindMapTreeProps) {
  return (
    <div className="p-4">
      <MindMapTreeNode node={data} depth={0} defaultExpanded />
    </div>
  )
}

export default MindMapTree
