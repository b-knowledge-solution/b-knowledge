/**
 * @fileoverview TanStack Query hooks for chat dialogs and conversations.
 * Extracts data-fetching concerns from UI hooks into the api/ layer.
 * @module features/chat/api/chatQueries
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from './chatApi'
import type {
  Conversation,
  ChatDialog,
  CreateDialogPayload,
} from '../types/chat.types'
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

/**
 * @description Return type for the useChatDialogs hook.
 */
export interface UseChatDialogsReturn {
  /** List of available dialogs */
  dialogs: ChatDialog[]
  /** Whether dialogs are being loaded */
  loading: boolean
  /** The currently selected dialog */
  activeDialog: ChatDialog | null
  /** Set the active dialog by ID */
  setActiveDialogId: (id: string | null) => void
  /** Create a new dialog */
  createDialog: (data: CreateDialogPayload) => Promise<ChatDialog | null>
  /** Delete a dialog by ID */
  deleteDialog: (id: string) => Promise<void>
  /** Refresh the dialog list */
  refresh: () => void
}

// ============================================================================
// useChatConversations
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

// ============================================================================
// useChatDialogs
// ============================================================================

/** Query key for the dialog list */
const DIALOGS_KEY = queryKeys.chat.dialogs()

/**
 * @description Hook to manage chat dialog configurations.
 * Uses useQuery for fetching and useMutation for create/delete.
 * @returns Dialog state and CRUD functions
 */
export function useChatDialogs(): UseChatDialogsReturn {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Local UI state for active dialog selection
  const [activeDialogId, setActiveDialogId] = useState<string | null>(null)

  // Fetch all dialogs using useQuery
  const { data: dialogs = [], isLoading } = useQuery({
    queryKey: DIALOGS_KEY,
    queryFn: () => chatApi.listDialogs(),
  })

  // Auto-select first dialog when data loads and none is selected
  useEffect(() => {
    if (!activeDialogId && dialogs.length > 0) {
      setActiveDialogId(dialogs[0]!.id)
    }
  }, [activeDialogId, dialogs])

  // Derive the active dialog from the fetched list
  const activeDialog = dialogs.find((d) => d.id === activeDialogId) || null

  // Mutation to create a new dialog
  const createMutation = useMutation({
    mutationFn: (data: CreateDialogPayload) => chatApi.createDialog(data),
    onSuccess: (dialog) => {
      // Invalidate dialogs list to refetch
      queryClient.invalidateQueries({ queryKey: DIALOGS_KEY })
      // Set new dialog as active
      setActiveDialogId(dialog.id)
      globalMessage.success(t('common.createSuccess'))
    },
    onError: (error: any) => {
      globalMessage.error(error?.message || t('common.error'))
    },
  })

  // Mutation to delete a dialog
  const deleteMutation = useMutation({
    mutationFn: (id: string) => chatApi.deleteDialog(id),
    onSuccess: (_data, id) => {
      // Invalidate dialogs list to refetch
      queryClient.invalidateQueries({ queryKey: DIALOGS_KEY })
      // Clear active if it was the deleted one
      if (activeDialogId === id) {
        setActiveDialogId(null)
      }
      globalMessage.success(t('common.deleteSuccess'))
    },
    onError: (error: any) => {
      globalMessage.error(error?.message || t('common.error'))
    },
  })

  /**
   * Create a new dialog.
   * @param data - Dialog creation payload
   * @returns The created dialog or null on failure
   */
  const createDialog = async (data: CreateDialogPayload): Promise<ChatDialog | null> => {
    try {
      return await createMutation.mutateAsync(data)
    } catch {
      return null
    }
  }

  /**
   * Delete a dialog by ID.
   * @param id - Dialog identifier
   */
  const deleteDialog = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync(id)
  }

  /**
   * Refresh the dialog list by invalidating the query cache.
   */
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: DIALOGS_KEY })
  }

  return {
    dialogs,
    loading: isLoading,
    activeDialog,
    setActiveDialogId,
    createDialog,
    deleteDialog,
    refresh,
  }
}
