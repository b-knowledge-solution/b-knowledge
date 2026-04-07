/**
 * @fileoverview Healthcare organizational chart with dropdown-driven node highlighting.
 *
 * Renders a landscape org chart using `react-organizational-chart`. Each node is a
 * shadcn Card, which lets us apply Tailwind highlight classes when the node is
 * selected via the shadcn Select dropdown.
 *
 * @module features/knowledge-base/components/HealthcareOrgChart
 */

import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Tree, TreeNode } from 'react-organizational-chart'

import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Single org chart node definition
 */
interface OrgNode {
  /** Unique node identifier used by the dropdown */
  id: string
  /** Display title (e.g. person name) */
  title: string
  /** Role / position subtitle */
  role: string
  /** Tailwind background color token for the node card */
  color: string
  /** Child nodes (reporting lines) */
  children?: OrgNode[]
}

// ============================================================================
// Static data — sample healthcare org structure
// ============================================================================

// Hardcoded sample tree. In a real integration this would come from an API.
const ORG_DATA: OrgNode = {
  id: 'ceo',
  title: 'Jane Doe',
  role: 'CEO (Chief Executive Officer)',
  color: 'bg-slate-800 text-white',
  children: [
    {
      id: 'coo',
      title: 'Mark Lee',
      role: 'COO (Chief Operating Officer)',
      color: 'bg-indigo-600 text-white',
      children: [
        {
          id: 'office-manager',
          title: 'Alice Brown',
          role: 'Office Manager',
          color: 'bg-fuchsia-500 text-white',
          children: [
            { id: 'office-staff-1', title: 'Office Staff 1', role: 'Staff', color: 'bg-fuchsia-300 text-fuchsia-900' },
            { id: 'office-staff-2', title: 'Office Staff 2', role: 'Staff', color: 'bg-fuchsia-300 text-fuchsia-900' },
          ],
        },
        {
          id: 'nurse-manager',
          title: 'Bob White',
          role: 'Nurse Manager',
          color: 'bg-fuchsia-500 text-white',
          children: [
            { id: 'nurse-1', title: 'Registered Nurse 1', role: 'RN', color: 'bg-fuchsia-300 text-fuchsia-900' },
            { id: 'nurse-2', title: 'Registered Nurse 2', role: 'RN', color: 'bg-fuchsia-300 text-fuchsia-900' },
          ],
        },
      ],
    },
    {
      id: 'cfo',
      title: 'Priya Shah',
      role: 'CFO (Chief Financial Officer)',
      color: 'bg-indigo-600 text-white',
      children: [
        {
          id: 'accounting-manager',
          title: 'Carlos Diaz',
          role: 'Accounting Manager',
          color: 'bg-fuchsia-500 text-white',
          children: [
            { id: 'accounting-staff-1', title: 'Accounting Staff 1', role: 'Staff', color: 'bg-fuchsia-300 text-fuchsia-900' },
            { id: 'accounting-staff-2', title: 'Accounting Staff 2', role: 'Staff', color: 'bg-fuchsia-300 text-fuchsia-900' },
          ],
        },
        {
          id: 'budget-manager',
          title: 'Dana Kim',
          role: 'Budget Manager',
          color: 'bg-fuchsia-500 text-white',
          children: [
            { id: 'budget-staff-1', title: 'Budget Staff 1', role: 'Staff', color: 'bg-fuchsia-300 text-fuchsia-900' },
            { id: 'budget-staff-2', title: 'Budget Staff 2', role: 'Staff', color: 'bg-fuchsia-300 text-fuchsia-900' },
          ],
        },
      ],
    },
    {
      id: 'cmo',
      title: 'Dr. Evan Park',
      role: 'CMO (Chief Medical Officer)',
      color: 'bg-indigo-600 text-white',
      children: [
        {
          id: 'chief-physician',
          title: 'Dr. Fatima Noor',
          role: 'Chief Physician',
          color: 'bg-fuchsia-500 text-white',
          children: [
            { id: 'physician-1', title: 'Physician 1', role: 'MD', color: 'bg-fuchsia-300 text-fuchsia-900' },
            { id: 'physician-2', title: 'Physician 2', role: 'MD', color: 'bg-fuchsia-300 text-fuchsia-900' },
          ],
        },
        {
          id: 'chief-technician',
          title: 'Greg Ortiz',
          role: 'Chief Technician',
          color: 'bg-fuchsia-500 text-white',
          children: [
            { id: 'lab-tech-1', title: 'Lab Technician 1', role: 'Technician', color: 'bg-fuchsia-300 text-fuchsia-900' },
            { id: 'lab-tech-2', title: 'Lab Technician 2', role: 'Technician', color: 'bg-fuchsia-300 text-fuchsia-900' },
          ],
        },
      ],
    },
  ],
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Recursively flatten the org tree into a list for the dropdown
 * @param {OrgNode} node - Root node to flatten
 * @returns {OrgNode[]} Flat list of all nodes in the tree
 */
const flattenNodes = (node: OrgNode): OrgNode[] => {
  // Start with the current node
  const acc: OrgNode[] = [node]
  // Recurse into every child and append results
  for (const child of node.children ?? []) {
    acc.push(...flattenNodes(child))
  }
  return acc
}

// ============================================================================
// Node card
// ============================================================================

/**
 * @description Visual card for a single org node. Highlights when selected.
 * @param {{ node: OrgNode; selectedId: string | null }} props - Node data and current selection
 * @returns {JSX.Element} Rendered node card
 */
// Tailwind classes applied to a highlighted node — overrides background + text
const HIGHLIGHT_CLASSES = 'bg-amber-400 text-slate-900 ring-4 ring-amber-500 ring-offset-2 ring-offset-background scale-105 shadow-lg'

/**
 * @description Visual card for a single org node. When highlighted, the card swaps
 * its background and text color entirely (not just a ring overlay).
 * @param {{ node: OrgNode; highlightedNodeId: string | null }} props - Node data and the currently highlighted node id
 * @returns {JSX.Element} Rendered node card
 */
const NodeCard = ({ node, highlightedNodeId }: { node: OrgNode; highlightedNodeId: string | null }) => {
  // Only one node is highlighted at a time — compare ids to decide styling
  const isHighlighted = highlightedNodeId === node.id

  // When highlighted, drop the node's own color classes and use HIGHLIGHT_CLASSES instead,
  // so the background + text color visibly change rather than just showing an outline.
  const appearance = isHighlighted ? HIGHLIGHT_CLASSES : node.color

  return (
    <Card
      className={`inline-block px-4 py-2 min-w-[140px] border-0 rounded-md shadow-sm transition-all ${appearance}`}
    >
      <div className="text-sm font-semibold leading-tight">{node.title}</div>
      <div className="text-[11px] opacity-90 leading-tight">{node.role}</div>
    </Card>
  )
}

/**
 * @description Recursively render org tree nodes inside `react-organizational-chart`
 * @param {OrgNode} node - Current subtree root
 * @param {string | null} highlightedNodeId - Id of the node that should be highlighted
 * @returns {ReactElement} Rendered TreeNode subtree
 */
const renderTree = (node: OrgNode, highlightedNodeId: string | null): ReactElement => (
  <TreeNode label={<NodeCard node={node} highlightedNodeId={highlightedNodeId} />}>
    {(node.children ?? []).map(child => (
      // Recurse so every descendant is wrapped in a TreeNode
      <div key={child.id}>{renderTree(child, highlightedNodeId)}</div>
    ))}
  </TreeNode>
)

// ============================================================================
// Props
// ============================================================================

/**
 * @description Props for `HealthcareOrgChart`. Parents can pass a controlled
 * `highlightedNodeId` to drive the highlight from outside, and subscribe to
 * dropdown changes via `onHighlightChange`.
 */
export interface HealthcareOrgChartProps {
  /** Controlled highlighted node id (from parent). If omitted, the component manages its own state. */
  highlightedNodeId?: string | null
  /** Fired when the user picks a different node in the dropdown */
  onHighlightChange?: (nodeId: string | null) => void
}

// ============================================================================
// Main component
// ============================================================================

/**
 * @description Healthcare organizational chart with a dropdown that highlights the chosen node.
 * Supports controlled mode (parent passes `highlightedNodeId`) and uncontrolled mode
 * (component tracks selection internally). In both cases, highlighting swaps the node's
 * background and text color via Tailwind classes.
 * @param {HealthcareOrgChartProps} props - Optional controlled highlight id + change handler
 * @returns {JSX.Element} Rendered org chart tab content
 */
const HealthcareOrgChart = ({ highlightedNodeId, onHighlightChange }: HealthcareOrgChartProps = {}) => {
  const { t } = useTranslation()

  // Internal fallback state used only when the parent does not control the highlight
  const [internalId, setInternalId] = useState<string | null>(null)

  // Treat the component as controlled when the parent explicitly passes the prop (even null)
  const isControlled = highlightedNodeId !== undefined
  const activeId = isControlled ? highlightedNodeId ?? null : internalId

  /**
   * @description Handle dropdown change — updates internal state if uncontrolled
   * and always notifies the parent via `onHighlightChange`.
   * @param {string | null} nextId - Newly selected node id, or null to clear
   */
  const handleChange = (nextId: string | null) => {
    // Only mutate internal state when we own it — otherwise the parent is source of truth
    if (!isControlled) setInternalId(nextId)
    onHighlightChange?.(nextId)
  }

  // Flatten the tree once per render so the dropdown lists every node
  const allNodes = flattenNodes(ORG_DATA)

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4 py-4">
      {/* Dropdown selector — highlights a single node in the chart below */}
      <div className="flex items-center gap-3 shrink-0">
        <label className="text-sm font-medium text-foreground">
          {t('knowledgeBase.orgChart.highlightLabel', 'Highlight node')}
        </label>
        <Select
          value={activeId ?? ''}
          onValueChange={(value: string) => handleChange(value || null)}
        >
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder={t('knowledgeBase.orgChart.selectPlaceholder', 'Select a node to highlight…')} />
          </SelectTrigger>
          <SelectContent>
            {allNodes.map(node => (
              <SelectItem key={node.id} value={node.id}>
                {node.title} — {node.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Scrollable canvas so the landscape tree doesn't clip on small screens */}
      <div className="flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-6">
        <Tree
          lineWidth="2px"
          lineColor="hsl(var(--border))"
          lineBorderRadius="8px"
          label={<NodeCard node={ORG_DATA} highlightedNodeId={activeId} />}
        >
          {(ORG_DATA.children ?? []).map(child => (
            <div key={child.id}>{renderTree(child, activeId)}</div>
          ))}
        </Tree>
      </div>
    </div>
  )
}

export default HealthcareOrgChart
