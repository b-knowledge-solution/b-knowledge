/**
 * @fileoverview Chat sidebar component for listing and managing conversations.
 * Supports inline renaming, deletion, and search filtering.
 * @module features/chat/components/ChatSidebar
 */

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
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
 * @description Sidebar listing conversations with search, create, inline rename, and delete.
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
  onRename,
  search,
  onSearchChange,
}: ChatSidebarProps) {
  const { t } = useTranslation()

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus and select input text when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  /**
   * @description Start inline rename for a conversation.
   * @param conv - The conversation to rename
   */
  const startRename = (conv: Conversation) => {
    setEditingId(conv.id)
    setEditValue(conv.name)
  }

  /**
   * @description Confirm the rename and call the onRename callback.
   */
  const confirmRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    setEditingId(null)
    setEditValue('')
  }

  /**
   * @description Cancel the inline rename without saving.
   */
  const cancelRename = () => {
    setEditingId(null)
    setEditValue('')
  }

  // Filter conversations by search
  const filtered = search
    ? conversations.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : conversations

  return (
    <div className={`flex flex-col border-r border-border bg-muted/50 ${className}`}>
      {/* Header */}
      <div className="p-3 space-y-2">
        <button
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          {t('chat.newConversation')}
        </button>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('common.searchPlaceholder')}
          className="w-full h-8 px-2.5 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{t('common.noData')}</p>
        ) : (
          filtered.map((conv) => (
            <div
              key={conv.id}
              className={`group flex items-center gap-1 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                conv.id === activeConversationId
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'hover:bg-muted text-foreground'
              }`}
              onClick={() => {
                // Don't navigate when editing
                if (editingId !== conv.id) {
                  onSelect(conv.id)
                }
              }}
            >
              {editingId === conv.id ? (
                /* Inline rename input */
                <>
                  <input
                    ref={editInputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    className="flex-1 min-w-0 h-6 px-1.5 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded shrink-0 text-primary hover:bg-primary/10 transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      confirmRename()
                    }}
                    title={t('common.save')}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded shrink-0 text-muted-foreground hover:bg-muted transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      cancelRename()
                    }}
                    title={t('common.cancel')}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                /* Normal display with hover actions */
                <>
                  <span className="flex-1 truncate">{conv.name}</span>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      startRename(conv)
                    }}
                    title={t('common.rename')}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(conv.id)
                    }}
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ChatSidebar
