/**
 * @fileoverview Conversation list sidebar for the chat feature.
 * @module features/ai/components/ChatSidebar
 */

import { useTranslation } from 'react-i18next'
import { Plus, Search, Trash2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ConfirmDialog'
import type { Conversation } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatSidebarProps {
  /** Array of conversations to display */
  conversations: Conversation[]
  /** Whether conversations are loading */
  loading?: boolean
  /** ID of the currently active conversation */
  activeConversationId?: string | null | undefined
  /** Callback when a conversation is selected */
  onSelect: (id: string) => void
  /** Callback to create a new conversation */
  onCreate: () => void
  /** Callback to delete a conversation */
  onDelete: (id: string) => void
  /** Search filter value */
  search: string
  /** Callback to update search filter */
  onSearchChange: (value: string) => void
  /** Optional CSS class name */
  className?: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Group conversations by relative date label.
 * @param conversations - Array of conversations
 * @returns Map of date label to conversations
 */
function groupByDate(conversations: Conversation[]): Map<string, Conversation[]> {
  const groups = new Map<string, Conversation[]>()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  for (const conv of conversations) {
    const date = new Date(conv.updated_at || conv.created_at)
    let label: string

    if (date >= today) {
      label = 'today'
    } else if (date >= yesterday) {
      label = 'yesterday'
    } else if (date >= weekAgo) {
      label = 'thisWeek'
    } else {
      label = 'older'
    }

    const list = groups.get(label) || []
    list.push(conv)
    groups.set(label, list)
  }

  return groups
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Conversation list sidebar with search, create, and delete.
 * Groups conversations by date (today, yesterday, this week, older).
 *
 * @param {ChatSidebarProps} props - Component properties
 * @returns {JSX.Element} The rendered sidebar
 */
function ChatSidebar({
  conversations,
  loading,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  search,
  onSearchChange,
  className,
}: ChatSidebarProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  /**
   * Handle delete with confirmation dialog.
   * @param id - Conversation ID to delete
   */
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    // Prevent selecting the conversation when clicking delete
    e.stopPropagation()

    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('chat.confirmDeleteConversation'),
      variant: 'danger',
    })

    if (confirmed) {
      onDelete(id)
    }
  }

  // Group conversations by date
  const grouped = groupByDate(conversations)
  const dateLabels = ['today', 'yesterday', 'thisWeek', 'older'] as const
  const dateLabelKeys: Record<string, string> = {
    today: 'chat.today',
    yesterday: 'chat.yesterday',
    thisWeek: 'chat.thisWeek',
    older: 'chat.older',
  }

  return (
    <div className={cn('flex flex-col h-full bg-muted/30 border-r', className)}>
      {/* Header with create button */}
      <div className="p-3 border-b space-y-2">
        <Button
          variant="default"
          className="w-full justify-start gap-2"
          onClick={onCreate}
        >
          <Plus className="h-4 w-4" />
          {t('chat.newConversation')}
        </Button>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('common.searchPlaceholder')}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          // Loading skeleton
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{t('chat.noConversations')}</p>
          </div>
        ) : (
          // Grouped conversation list
          <div className="p-2">
            {dateLabels.map((label) => {
              const items = grouped.get(label)
              if (!items || items.length === 0) return null

              return (
                <div key={label} className="mb-3">
                  {/* Date group label */}
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                    {t(dateLabelKeys[label] || label)}
                  </p>

                  {/* Conversation items */}
                  {items.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => onSelect(conv.id)}
                      className={cn(
                        'w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-left group transition-colors',
                        activeConversationId === conv.id
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                      <span className="flex-1 truncate">{conv.name}</span>

                      {/* Delete button (visible on hover) */}
                      <button
                        onClick={(e) => handleDelete(conv.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatSidebar
