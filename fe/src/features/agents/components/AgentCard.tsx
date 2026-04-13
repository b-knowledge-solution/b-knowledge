/**
 * @fileoverview Agent card component for the agent list grid.
 * Displays agent metadata with mode-specific actions via kebab dropdown menu.
 * Supports agent, pipeline, chat, and search modes with distinct colors and actions.
 *
 * @module features/agents/components/AgentCard
 */

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MoreVertical, Pencil, Copy, Trash2, Download, Shield, ExternalLink, Code2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { buildAdminAgentCanvasPath } from '@/app/adminRoutes'

import type { AgentMode } from '../types/agent.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Unified item shape rendered by AgentCard.
 * Supports all 4 modes (agent, pipeline, chat, search) with a common interface.
 */
export interface AgentCardItem {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Optional description */
  description?: string | undefined
  /** Agent mode determines border color and available actions */
  mode: AgentMode
  /** Lifecycle status (only for agent/pipeline modes) */
  status?: 'draft' | 'published' | undefined
  /** ISO timestamp of last update */
  updated_at: string
}

/**
 * @description Props for the AgentCard component
 */
interface AgentCardProps {
  /** Item record to display */
  item: AgentCardItem
  /** Callback when duplicate action is triggered (agent/pipeline only) */
  onDuplicate?: (item: AgentCardItem) => void
  /** Callback when delete action is triggered */
  onDelete: (item: AgentCardItem) => void
  /** Callback when export JSON action is triggered (agent/pipeline only) */
  onExport?: (item: AgentCardItem) => void
  /** Callback when edit action is triggered (chat/search: opens config dialog) */
  onEdit?: (item: AgentCardItem) => void
  /** Callback when manage access action is triggered (chat/search only) */
  onAccess?: (item: AgentCardItem) => void
  /** Callback when embed action is triggered (search only) */
  onEmbed?: (item: AgentCardItem) => void
  /** Callback when open action is triggered (search only: opens search app page) */
  onOpen?: (item: AgentCardItem) => void
}

// ============================================================================
// Mode accent colors for left border
// ============================================================================

/** @description Border color mapping by agent mode for visual distinction */
const MODE_BORDER_COLOR: Record<AgentMode, string> = {
  agent: 'border-l-violet-500',
  pipeline: 'border-l-cyan-500',
  chat: 'border-l-blue-500',
  search: 'border-l-emerald-500',
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Card component for the unified agent list.
 * Renders name, mode/status badges, description, and a kebab dropdown menu
 * with mode-specific actions (edit, duplicate, delete, export, access, embed).
 * @param {AgentCardProps} props - Item data and action callbacks
 * @returns {JSX.Element} Rendered agent card
 */
export function AgentCard({
  item,
  onDuplicate,
  onDelete,
  onExport,
  onEdit,
  onAccess,
  onEmbed,
  onOpen,
}: AgentCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Determine if this is a canvas-based mode (navigable to agent canvas)
  const isCanvasMode = item.mode === 'agent' || item.mode === 'pipeline'

  /**
   * @description Handle primary edit action based on mode.
   * Agent/pipeline → navigate to canvas. Chat/search → trigger onEdit callback.
   */
  const handleEdit = () => {
    if (isCanvasMode) {
      navigate(buildAdminAgentCanvasPath(item.id))
    } else {
      onEdit?.(item)
    }
  }

  /**
   * @description Handle card body click.
   * Agent/pipeline → navigate to canvas. Chat/search → open config dialog.
   */
  const handleCardClick = () => {
    if (isCanvasMode) {
      navigate(buildAdminAgentCanvasPath(item.id))
    } else {
      onEdit?.(item)
    }
  }

  // Format the last modified date for display
  const lastModified = new Date(item.updated_at).toLocaleDateString()

  // Determine left border accent color based on agent mode
  const borderClass = MODE_BORDER_COLOR[item.mode] ?? 'border-l-slate-400'

  return (
    <Card
      className={`border-l-4 ${borderClass} hover:shadow-md transition-shadow cursor-pointer dark:bg-slate-800 dark:border-slate-700`}
      onClick={handleCardClick}
    >
      <CardContent className="p-4">
        {/* Header row: name + kebab menu */}
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate pr-2">
            {item.name}
          </h3>

          {/* Kebab dropdown menu - stop propagation to avoid card click */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
                <MoreVertical size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
              {/* Edit action — available for all modes */}
              <DropdownMenuItem onClick={handleEdit}>
                <Pencil size={14} className="mr-2" />
                {t('agents.edit')}
              </DropdownMenuItem>

              {/* Agent/pipeline-specific actions */}
              {isCanvasMode && (
                <>
                  {onDuplicate && (
                    <DropdownMenuItem onClick={() => onDuplicate(item)}>
                      <Copy size={14} className="mr-2" />
                      {t('agents.duplicate')}
                    </DropdownMenuItem>
                  )}
                  {onExport && (
                    <DropdownMenuItem onClick={() => onExport(item)}>
                      <Download size={14} className="mr-2" />
                      {t('agents.exportJson')}
                    </DropdownMenuItem>
                  )}
                </>
              )}

              {/* Search-specific: Open search app page */}
              {item.mode === 'search' && onOpen && (
                <DropdownMenuItem onClick={() => onOpen(item)}>
                  <ExternalLink size={14} className="mr-2" />
                  {t('searchAdmin.openApp')}
                </DropdownMenuItem>
              )}

              {/* Chat/search access management */}
              {!isCanvasMode && onAccess && (
                <DropdownMenuItem onClick={() => onAccess(item)}>
                  <Shield size={14} className="mr-2" />
                  {t('searchAdmin.manageAccess')}
                </DropdownMenuItem>
              )}

              {/* Search-specific: Embed */}
              {item.mode === 'search' && onEmbed && (
                <DropdownMenuItem onClick={() => onEmbed(item)}>
                  <Code2 size={14} className="mr-2" />
                  {t('searchAdmin.embedApp')}
                </DropdownMenuItem>
              )}

              {/* Delete action — available for all modes */}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(item)}
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
            {t(`agents.${item.mode}`)}
          </Badge>
          {/* Status badge only for agent/pipeline modes */}
          {isCanvasMode && item.status && (
            <Badge
              variant={item.status === 'published' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {t(`agents.${item.status}`)}
            </Badge>
          )}
        </div>

        {/* Description (truncated to 2 lines) */}
        {item.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
            {item.description}
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
