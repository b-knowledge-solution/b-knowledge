/**
 * @fileoverview Hook for managing chat conversations.
 * Provides CRUD operations for conversations within a dialog.
 * @module features/ai/hooks/useChatConversations
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { chatApi } from '../api/chatApi'
import type { Conversation } from '../types/chat.types'
import { globalMessage } from '@/app/App'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Return type for the useChatConversations hook.
 */
export interface UseChatConversationsReturn {
  /** List of conversations for the active dialog */
  conversations: Conversation[]
  /** Whether conversations are being loaded */
  loading: boolean
  /** The currently active conversation */
  activeConversation: Conversation | null
  /** Set the active conversation by ID */
  setActiveConversationId: (id: string | null) => void
  /** Create a new conversation */
  createConversation: (name?: string) => Promise<Conversation | null>
  /** Delete a conversation by ID */
  deleteConversation: (id: string) => Promise<void>
  /** Refresh the conversation list */
  refresh: () => void
  /** Search filter text */
  search: string
  /** Update search filter */
  setSearch: (value: string) => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook to manage conversations for a given dialog.
 * @param dialogId - The dialog whose conversations to manage
 * @returns Conversation state and CRUD functions
 */
export function useChatConversations(dialogId: string | null): UseChatConversationsReturn {
  const { t } = useTranslation()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  /**
   * Fetch conversations from the API.
   */
  const fetchConversations = useCallback(async () => {
    if (!dialogId) {
      setConversations([])
      return
    }
    setLoading(true)
    try {
      const data = await chatApi.listConversations(dialogId)
      setConversations(data)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setLoading(false)
    }
  }, [dialogId])

  // Fetch conversations when dialog changes
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  /**
   * Get the active conversation object.
   */
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null

  /**
   * Filter conversations by search text.
   */
  const filteredConversations = search.trim()
    ? conversations.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations

  /**
   * Create a new conversation under the active dialog.
   * @param name - Optional display name for the conversation
   * @returns The created conversation or null on failure
   */
  const createConversation = useCallback(
    async (name?: string): Promise<Conversation | null> => {
      if (!dialogId) return null
      try {
        const conv = await chatApi.createConversation({
          dialog_id: dialogId,
          name: name || t('chat.newConversation'),
        })
        // Add to list and set as active
        setConversations((prev) => [conv, ...prev])
        setActiveConversationId(conv.id)
        return conv
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'))
        return null
      }
    },
    [dialogId, t],
  )

  /**
   * Delete a conversation by ID.
   * @param id - Conversation identifier
   */
  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await chatApi.deleteConversation(id)
        // Remove from local list
        setConversations((prev) => prev.filter((c) => c.id !== id))
        // Clear active if it was the deleted one
        if (activeConversationId === id) {
          setActiveConversationId(null)
        }
        globalMessage.success(t('common.deleteSuccess'))
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'))
      }
    },
    [activeConversationId, t],
  )

  return {
    conversations: filteredConversations,
    loading,
    activeConversation,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    refresh: fetchConversations,
    search,
    setSearch,
  }
}
