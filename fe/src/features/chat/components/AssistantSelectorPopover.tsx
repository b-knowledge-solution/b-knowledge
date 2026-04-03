/**
 * @fileoverview Modern popover-based assistant selector for the chat input area.
 * Displays assistant cards with avatar, name, description, model badge, and KB count.
 * @module features/chat/components/AssistantSelectorPopover
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Check, Bot, Database } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { ChatAssistant } from '../types/chat.types'

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Generate a deterministic HSL color from a string for avatar backgrounds.
 * @param str - Input string to hash
 * @returns HSL color string
 */
function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

/**
 * @description Extract initials from an assistant name (max 2 chars).
 * @param name - Assistant display name
 * @returns Uppercase initials
 */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

// ============================================================================
// Props
// ============================================================================

interface AssistantSelectorPopoverProps {
  /** List of available assistants */
  assistants: ChatAssistant[]
  /** Currently active assistant ID */
  activeAssistantId: string | null
  /** Callback when an assistant is selected */
  onSelect: (id: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modern popover-based chat assistant selector.
 * Shows rich assistant cards with avatar, name, description, model badge, and KB count.
 * Placed in the chat input toolbar row for contextual assistant switching.
 *
 * @param {AssistantSelectorPopoverProps} props - Component properties
 * @returns {JSX.Element} The rendered assistant selector popover
 */
function AssistantSelectorPopover({
  assistants,
  activeAssistantId,
  onSelect,
}: AssistantSelectorPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  // Find the active assistant
  const activeAssistant = assistants.find((a) => a.id === activeAssistantId) ?? assistants[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id="chat-assistant-selector"
          className="inline-flex items-center gap-1.5 h-7 pl-2 pr-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 max-w-[220px]"
          title={t('chat.selectAssistant')}
        >
          {/* Mini avatar */}
          <span
            className="h-4 w-4 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
            style={{ backgroundColor: activeAssistant ? stringToColor(activeAssistant.name) : '#94a3b8' }}
          >
            {activeAssistant ? getInitials(activeAssistant.name) : '?'}
          </span>
          <span className="truncate">{activeAssistant?.name ?? t('chat.selectAssistant')}</span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[340px] p-0 shadow-xl border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {t('chat.selectAssistant')}
          </p>
        </div>

        {/* Assistant list */}
        <div className="max-h-[320px] overflow-y-auto py-1.5">
          {assistants.map((assistant) => {
            const isActive = assistant.id === activeAssistantId
            const color = stringToColor(assistant.name)

            return (
              <button
                key={assistant.id}
                className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-primary/5 dark:bg-primary/10'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                }`}
                onClick={() => {
                  onSelect(assistant.id)
                  setOpen(false)
                }}
              >
                {/* Avatar */}
                <span
                  className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-sm mt-0.5"
                  style={{ backgroundColor: color }}
                >
                  {getInitials(assistant.name)}
                </span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Name row */}
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-medium truncate ${
                      isActive
                        ? 'text-primary dark:text-primary'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}>
                      {assistant.name}
                    </span>
                    {isActive && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                    {assistant.description || t('chat.noDescription')}
                  </p>

                  {/* Meta badges */}
                  <div className="flex items-center gap-2 mt-1.5 w-full">
                    {assistant.llm_id && (
                      <span className="inline-flex items-center gap-1 min-w-0 flex-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800/50">
                        <Bot className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{assistant.llm_id}</span>
                      </span>
                    )}
                    {assistant.kb_ids.length > 0 && (
                      <span className="inline-flex items-center shrink-0 gap-1 text-[10px] whitespace-nowrap font-medium px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/50">
                        <Database className="h-2.5 w-2.5 shrink-0" />
                        <span>{t('chat.knowledgeBasesCount', { count: assistant.kb_ids.length })}</span>
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default AssistantSelectorPopover
