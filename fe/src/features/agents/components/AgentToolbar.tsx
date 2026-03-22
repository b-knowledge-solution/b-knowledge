/**
 * @fileoverview Top toolbar for the agent canvas page with save, navigation,
 * debug toggle, run/step/continue controls, and agent configuration.
 *
 * @module features/agents/components/AgentToolbar
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Save,
  Play,
  SkipForward,
  Bug,
  MoreHorizontal,
  Download,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import type { Agent, AgentStatus } from '../types/agent.types'

/**
 * @description Props for the AgentToolbar component
 */
interface AgentToolbarProps {
  agent: Agent | undefined
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onNameChange?: (name: string) => void
  /** Whether debug mode is currently active */
  isDebugActive?: boolean
  /** Toggle debug mode on/off */
  onToggleDebug?: () => void
  /** Execute next node in debug mode */
  onStepNext?: () => void
  /** Continue running all remaining nodes in debug mode */
  onContinueRun?: () => void
  /** Run the agent normally (non-debug) */
  onRunAgent?: () => void
}

/**
 * @description Top toolbar for the agent canvas with back navigation, inline agent name editing,
 * status badge, save/run/debug buttons, and a more actions dropdown.
 * When debug mode is active, shows Step and Continue buttons instead of Run.
 * @param {AgentToolbarProps} props - Toolbar configuration and event handlers
 * @returns {JSX.Element} 56px sticky toolbar at the top of the canvas page
 */
export function AgentToolbar({
  agent,
  isDirty,
  isSaving,
  onSave,
  onNameChange,
  isDebugActive = false,
  onToggleDebug,
  onStepNext,
  onContinueRun,
  onRunAgent,
}: AgentToolbarProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  /**
   * @description Navigates back to the agent list page
   */
  const handleBack = () => {
    navigate('/agents')
  }

  /**
   * @description Starts inline name editing by populating the input with current name
   */
  const handleStartEdit = () => {
    setNameValue(agent?.name ?? '')
    setEditingName(true)
  }

  /**
   * @description Commits the name change on blur or Enter key and exits edit mode
   */
  const handleFinishEdit = () => {
    setEditingName(false)
    // Only trigger change if name actually differs
    if (nameValue.trim() && nameValue !== agent?.name) {
      onNameChange?.(nameValue.trim())
    }
  }

  /**
   * @description Returns the appropriate badge variant for the agent status
   * @param {AgentStatus} status - Current agent status
   * @returns {string} Badge variant name
   */
  const statusVariant = (status: AgentStatus): 'default' | 'secondary' => {
    return status === 'published' ? 'default' : 'secondary'
  }

  /**
   * @description Exports the agent DSL as a downloadable JSON file
   */
  const handleExportJson = () => {
    if (!agent) return
    const blob = new Blob([JSON.stringify(agent.dsl, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agent.name.replace(/\s+/g, '-').toLowerCase()}-agent.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-14 border-b bg-background flex items-center justify-between px-4 sticky top-0 z-10">
      {/* Left section: back button, name, status */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">{t('common.back', 'Back')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('common.back', 'Back')}</TooltipContent>
        </Tooltip>

        {/* Inline editable agent name */}
        {editingName ? (
          <input
            className="text-lg font-semibold bg-transparent border-b border-primary outline-none px-1"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={(e) => {
              // Commit on Enter, cancel on Escape
              if (e.key === 'Enter') handleFinishEdit()
              if (e.key === 'Escape') setEditingName(false)
            }}
            autoFocus
          />
        ) : (
          <button
            className="text-lg font-semibold hover:underline cursor-pointer bg-transparent border-none p-0"
            onClick={handleStartEdit}
          >
            {agent?.name ?? t('agents.canvasTitle')}
            {/* Unsaved changes indicator */}
            {isDirty && (
              <span className="ml-1 text-orange-500" title="Unsaved changes">*</span>
            )}
          </button>
        )}

        {/* Status badge */}
        {agent?.status && (
          <Badge variant={statusVariant(agent.status)}>
            {t(`agents.${agent.status}`, agent.status)}
          </Badge>
        )}
      </div>

      {/* Right section: save, debug toggle, run/step/continue, more */}
      <div className="flex items-center gap-2">
        <Button onClick={onSave} disabled={isSaving || !isDirty} size="sm">
          <Save className="h-4 w-4 mr-1" />
          {isSaving ? t('common.saving', 'Saving...') : t('agents.agentSaved', 'Save Agent').replace(' saved', '')}
          <span className="sr-only">{t('agents.agentSaved', 'Save Agent')}</span>
        </Button>

        {/* Debug mode toggle switch */}
        {onToggleDebug && (
          <div className="flex items-center gap-1.5 mx-1">
            <Bug className="h-4 w-4 text-muted-foreground" />
            <Switch
              checked={isDebugActive}
              onCheckedChange={onToggleDebug}
              aria-label={t('agents.debugMode', 'Debug mode')}
            />
            <span className="text-xs text-muted-foreground">
              {t('agents.debug', 'Debug')}
            </span>
          </div>
        )}

        {/* Show Step/Continue buttons when debug is active, otherwise Run button */}
        {isDebugActive ? (
          <>
            <Button size="sm" onClick={onStepNext}>
              <SkipForward className="h-4 w-4 mr-1" />
              {t('agents.stepNext', 'Step')}
            </Button>
            <Button size="sm" variant="outline" onClick={onContinueRun}>
              <Play className="h-4 w-4 mr-1" />
              {t('agents.continueRun', 'Continue')}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onRunAgent} disabled={!onRunAgent}>
            <Play className="h-4 w-4 mr-1" />
            {t('common.run', 'Run')}
            <span className="sr-only">{t('common.run', 'Run Agent')}</span>
          </Button>
        )}

        {/* More actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">{t('common.more', 'More')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportJson}>
              <Download className="h-4 w-4 mr-2" />
              {t('agents.exportJson', 'Export JSON')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                // Delete is handled at page level; for now just navigate back
                navigate('/agents')
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('agents.deleteAgent', 'Delete Agent')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
