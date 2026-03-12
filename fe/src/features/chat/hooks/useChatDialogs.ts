/**
 * @fileoverview Hook for managing chat dialogs (assistant configurations) using TanStack Query.
 * @module features/ai/hooks/useChatDialogs
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from '../api/chatApi'
import type { ChatDialog, CreateDialogPayload } from '../types/chat.types'
import { globalMessage } from '@/app/App'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// Types
// ============================================================================

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
// Hook
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
