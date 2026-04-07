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
const NodeCard = ({ node, selectedId }: { node: OrgNode; selectedId: string | null }) => {
  // Apply a ring + scale when this node is the one chosen in the dropdown
  const isHighlighted = selectedId === node.id

  return (
    <Card
      className={`inline-block px-4 py-2 min-w-[140px] border-0 rounded-md shadow-sm transition-all ${node.color} ${
        isHighlighted ? 'ring-4 ring-amber-400 ring-offset-2 ring-offset-background scale-105' : ''
      }`}
    >
      <div className="text-sm font-semibold leading-tight">{node.title}</div>
      <div className="text-[11px] opacity-90 leading-tight">{node.role}</div>
    </Card>
  )
}

/**
 * @description Recursively render org tree nodes inside `react-organizational-chart`
 * @param {{ node: OrgNode; selectedId: string | null }} props - Node data and current selection
 * @returns {JSX.Element} Rendered TreeNode subtree
 */
const renderTree = (node: OrgNode, selectedId: string | null): ReactElement => (
  <TreeNode label={<NodeCard node={node} selectedId={selectedId} />}>
    {(node.children ?? []).map(child => (
      // Recurse so every descendant is wrapped in a TreeNode
      <div key={child.id}>{renderTree(child, selectedId)}</div>
    ))}
  </TreeNode>
)

// ============================================================================
// Main component
// ============================================================================

/**
 * @description Healthcare organizational chart with a dropdown that highlights the chosen node.
 * Uses `react-organizational-chart` for a landscape tree and shadcn `Select` for the picker.
 * @returns {JSX.Element} Rendered org chart tab content
 */
const HealthcareOrgChart = () => {
  const { t } = useTranslation()

  // Currently highlighted node id (null = nothing selected)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
          value={selectedId ?? ''}
          onValueChange={(value: string) => setSelectedId(value || null)}
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
          label={<NodeCard node={ORG_DATA} selectedId={selectedId} />}
        >
          {(ORG_DATA.children ?? []).map(child => (
            <div key={child.id}>{renderTree(child, selectedId)}</div>
          ))}
        </Tree>
      </div>
    </div>
  )
}

export default HealthcareOrgChart
