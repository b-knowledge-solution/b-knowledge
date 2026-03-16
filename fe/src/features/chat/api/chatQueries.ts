/**
 * @fileoverview TanStack Query hooks for chat assistants and conversations.
 * @module features/chat/api/chatQueries
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { chatApi } from './chatApi'
import type { ChatAssistant, Conversation } from '../types/chat.types'

// ============================================================================
// Query Keys
// ============================================================================

const chatKeys = {
  all: ['chat'] as const,
  assistants: () => [...chatKeys.all, 'assistants'] as const,
  conversations: (assistantId: string) => [...chatKeys.all, 'conversations', assistantId] as const,
}

// ============================================================================
// Assistant Hooks
// ============================================================================

/**
 * @description Hook to manage chat assistants with active assistant selection.
 * Fetches all assistants (no pagination) for the chat page selector.
 * @returns Assistant list state and active assistant management
 */
export function useChatAssistants() {
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: chatKeys.assistants(),
    queryFn: () => chatApi.listAssistants(),
  })

  const assistants = query.data?.data ?? []
  const activeAssistant = assistants.find((d) => d.id === activeAssistantId) ?? assistants[0] ?? null

  /**
   * Create a new assistant.
   * @param data - Assistant creation payload
   * @returns The created assistant
   */
  const createAssistant = async (data: Parameters<typeof chatApi.createAssistant>[0]) => {
    const result = await chatApi.createAssistant(data)
    await queryClient.invalidateQueries({ queryKey: chatKeys.assistants() })
    return result
  }

  /**
   * Delete an assistant by ID.
   * @param id - Assistant identifier
   */
  const deleteAssistant = async (id: string) => {
    await chatApi.deleteAssistant(id)
    await queryClient.invalidateQueries({ queryKey: chatKeys.assistants() })
  }

  /**
   * Invalidate assistant cache to trigger refetch.
   */
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: chatKeys.assistants() })
  }

  return {
    assistants,
    activeAssistant,
    activeAssistantId: activeAssistant?.id ?? null,
    setActiveAssistantId,
    createAssistant,
    deleteAssistant,
    refresh,
    loading: query.isLoading,
    error: query.error,
  }
}

/** Parameters for the admin chat assistants list query */
export interface ChatAssistantsAdminParams {
  page?: number | undefined
  page_size?: number | undefined
  search?: string | undefined
  sort_by?: 'created_at' | 'name' | undefined
  sort_order?: 'asc' | 'desc' | undefined
}

/**
 * @description Hook to fetch paginated chat assistants for admin management.
 * @param params - Pagination, search, and sorting parameters
 * @returns Query result with data array, total count, and loading state
 */
export function useChatAssistantsAdmin(params: ChatAssistantsAdminParams = {}) {
  const query = useQuery({
    queryKey: queryKeys.chat.dialogs(params as Record<string, unknown>),
    queryFn: () => chatApi.listAssistants(params),
  })

  return {
    assistants: query.data?.data ?? [] as ChatAssistant[],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    error: query.error,
  }
}

// ============================================================================
// Conversation Hooks
// ============================================================================

/**
 * @description Hook to manage conversations for an assistant.
 * @param assistantId - Parent assistant identifier
 * @returns Conversation list state and CRUD operations
 */
export function useChatConversations(assistantId: string | null) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: chatKeys.conversations(assistantId ?? ''),
    queryFn: () => chatApi.listConversations(assistantId!),
    enabled: !!assistantId,
  })

  const conversations = query.data ?? []
  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null

  /**
   * Create a new conversation and set it as active.
   * @param name - Optional conversation name
   * @returns The created conversation or null on failure
   */
  const createConversation = async (name?: string): Promise<Conversation | null> => {
    if (!assistantId) return null
    try {
      const payload = name ? { dialog_id: assistantId, name } : { dialog_id: assistantId }
      const conv = await chatApi.createConversation(payload)
      await queryClient.invalidateQueries({ queryKey: chatKeys.conversations(assistantId) })
      setActiveConversationId(conv.id)
      return conv
    } catch {
      return null
    }
  }

  /**
   * Delete a conversation.
   * @param id - Conversation identifier
   */
  const deleteConversation = async (id: string) => {
    await chatApi.deleteConversation(id)
    if (activeConversationId === id) {
      setActiveConversationId(null)
    }
    if (assistantId) {
      await queryClient.invalidateQueries({ queryKey: chatKeys.conversations(assistantId) })
    }
  }

  /**
   * Refresh the conversation list.
   */
  const refresh = () => {
    if (assistantId) {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversations(assistantId) })
    }
  }

  return {
    conversations,
    activeConversation,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    refresh,
    loading: query.isLoading,
    search,
    setSearch,
  }
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * @description Hook for renaming a conversation.
 * @returns Mutation object for renaming
 */
export function useRenameConversation() {
  return useMutation({
    mutationFn: ({ conversationId, name }: { conversationId: string; name: string }) =>
      chatApi.renameConversation(conversationId, name),
  })
}
