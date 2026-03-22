/**
 * @fileoverview Agent card component for the agent list grid.
 * Displays agent metadata with actions via kebab dropdown menu.
 *
 * @module features/agents/components/AgentCard
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, Pencil, Copy, Trash2, Download } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { Agent } from '../types/agent.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the AgentCard component
 */
interface AgentCardProps {
  /** Agent record to display */
  agent: Agent
  /** Callback when duplicate action is triggered */
  onDuplicate: (agent: Agent) => void
  /** Callback when delete action is triggered */
  onDelete: (agent: Agent) => void
  /** Callback when export JSON action is triggered */
  onExport: (agent: Agent) => void
}

// ============================================================================
// Mode accent colors for left border
// ============================================================================

/** @description Border color mapping by agent mode for visual distinction */
const MODE_BORDER_COLOR: Record<string, string> = {
  agent: 'border-l-violet-500',
  pipeline: 'border-l-cyan-500',
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Card component for agent list items displaying name, mode/status badges,
 * description, and a kebab dropdown menu with edit, duplicate, delete, and export actions.
 * @param {AgentCardProps} props - Agent data and action callbacks
 * @returns {JSX.Element} Rendered agent card
 */
export function AgentCard({ agent, onDuplicate, onDelete, onExport }: AgentCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /**
   * @description Navigate to the agent canvas editor for this agent
   */
  const handleEdit = () => {
    navigate(`/agents/${agent.id}`)
  }

  /**
   * @description Navigate to agent canvas on card body click (not dropdown)
   */
  const handleCardClick = () => {
    navigate(`/agents/${agent.id}`)
  }

  // Format the last modified date for display
  const lastModified = new Date(agent.updated_at).toLocaleDateString()

  // Determine left border accent color based on agent mode
  const borderClass = MODE_BORDER_COLOR[agent.mode] ?? 'border-l-slate-400'

  return (
    <Card
      className={`border-l-4 ${borderClass} hover:shadow-md transition-shadow cursor-pointer dark:bg-slate-800 dark:border-slate-700`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        {/* Header row: name + kebab menu */}
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate pr-2">
            {agent.name}
          </h3>

          {/* Kebab dropdown menu - stop propagation to avoid card click */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil size={14} className="mr-2" />
                {t('agents.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(agent)}>
                <Copy size={14} className="mr-2" />
                {t('agents.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport(agent)}>
                <Download size={14} className="mr-2" />
                {t('agents.exportJson')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(agent)}
                className="text-red-600 dark:text-red-400"
              >
                <Trash2 size={14} className="mr-2" />
                {t('agents.deleteAgent')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mode and status badges */}
        <div className="flex gap-1.5 mb-2">
          <Badge variant="outline" className="text-xs">
            {t(`agents.${agent.mode}`)}
          </Badge>
          <Badge
            variant={agent.status === 'published' ? 'default' : 'secondary'}
            className="text-xs"
          >
            {t(`agents.${agent.status}`)}
          </Badge>
        </div>

        {/* Description (truncated to 2 lines) */}
        {agent.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
            {agent.description}
          </p>
        )}

        {/* Last modified date */}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {lastModified}
        </p>
      </CardContent>
    </Card>
  )
}
