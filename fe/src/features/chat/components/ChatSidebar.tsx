/**
 * @fileoverview Chat sidebar component for listing and managing conversations.
 * @module features/chat/components/ChatSidebar
 */

import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import type { Conversation } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatSidebarProps {
  /** CSS class name */
  className?: string
  /** List of conversations */
  conversations: Conversation[]
  /** Whether conversations are loading */
  loading: boolean
  /** Currently active conversation ID */
  activeConversationId?: string | undefined
  /** Callback when a conversation is selected */
  onSelect: (id: string) => void
  /** Callback to create a new conversation */
  onCreate: () => void
  /** Callback to delete a conversation */
  onDelete: (id: string) => void
  /** Callback to rename a conversation */
  onRename: (id: string, name: string) => void
  /** Search query */
  search: string
  /** Callback when search changes */
  onSearchChange: (search: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Sidebar listing conversations with search, create, and delete.
 *
 * @param {ChatSidebarProps} props - Component properties
 * @returns {JSX.Element} The rendered sidebar
 */
function ChatSidebar({
  className = '',
  conversations,
  loading,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  onRename: _onRename,
  search,
  onSearchChange,
}: ChatSidebarProps) {
  const { t } = useTranslation()

  // Filter conversations by search
  const filtered = search
    ? conversations.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations

  return (
    <div className={`flex flex-col border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 ${className}`}>
      {/* Header */}
      <div className="p-3 space-y-2">
        <button
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          {t('chat.newConversation')}
        </button>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('common.searchPlaceholder')}
          className="w-full h-8 px-2.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {loading ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">{t('common.noData')}</p>
        ) : (
          filtered.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                conv.id === activeConversationId
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
              onClick={() => onSelect(conv.id)}
            >
              <span className="flex-1 truncate">{conv.name}</span>
              <button
                className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 shrink-0 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(conv.id)
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ChatSidebar
