/**
 * @fileoverview Hook for managing chat conversations using TanStack Query.
 * Provides CRUD operations for conversations within a dialog.
 * @module features/ai/hooks/useChatConversations
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from '../api/chatApi'
import type { Conversation } from '../types/chat.types'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'

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
 * Uses useQuery for fetching and useMutation for create/delete.
 * @param dialogId - The dialog whose conversations to manage
 * @returns Conversation state and CRUD functions
 */
export function useChatConversations(dialogId: string | null): UseChatConversationsReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Local UI state for active selection and search filter
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Query key for conversation list
  const conversationsKey = queryKeys.chat.conversations(dialogId ?? '')

  // Fetch conversations using useQuery
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: conversationsKey,
    queryFn: () => chatApi.listConversations(dialogId!),
    // Only fetch when dialogId is available
    enabled: !!dialogId,
  })

  // Derive the active conversation from the fetched list
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null

  // Filter conversations by search text
  const filteredConversations = search.trim()
    ? conversations.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations

  // Mutation to create a new conversation
  const createMutation = useMutation({
    mutationFn: async (name?: string) => {
      if (!dialogId) throw new Error('No dialog selected')
      return chatApi.createConversation({
        dialog_id: dialogId,
        name: name || t('chat.newConversation'),
      })
    },
    onSuccess: (conv) => {
      // Invalidate the conversations list to refetch
      queryClient.invalidateQueries({ queryKey: conversationsKey })
      // Set the new conversation as active
      setActiveConversationId(conv.id)
    },
    onError: (error: any) => {
      globalMessage.error(error?.message || t('common.error'))
    },
  })

  // Mutation to delete a conversation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => chatApi.deleteConversation(id),
    onSuccess: (_data, id) => {
      // Invalidate the conversations list to refetch
      queryClient.invalidateQueries({ queryKey: conversationsKey })
      // Clear active if it was the deleted one
      if (activeConversationId === id) {
        setActiveConversationId(null)
      }
      globalMessage.success(t('common.deleteSuccess'))
    },
    onError: (error: any) => {
      globalMessage.error(error?.message || t('common.error'))
    },
  })

  /**
   * Create a new conversation under the active dialog.
   * @param name - Optional display name for the conversation
   * @returns The created conversation or null on failure
   */
  const createConversation = async (name?: string): Promise<Conversation | null> => {
    try {
      return await createMutation.mutateAsync(name)
    } catch {
      return null
    }
  }

  /**
   * Delete a conversation by ID.
   * @param id - Conversation identifier
   */
  const deleteConversation = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id)
  }

  /**
   * Refresh the conversation list by invalidating the query cache.
   */
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: conversationsKey })
  }

  return {
    conversations: filteredConversations,
    loading: isLoading,
    activeConversation,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    refresh,
    search,
    setSearch,
  }
}
