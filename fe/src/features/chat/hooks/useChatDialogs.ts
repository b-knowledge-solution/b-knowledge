/**
 * @fileoverview Hook for managing chat dialogs (assistant configurations).
 * @module features/ai/hooks/useChatDialogs
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { chatApi } from '../api/chatApi'
import type { ChatDialog, CreateDialogPayload } from '../types/chat.types'
import { globalMessage } from '@/app/App'

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

/**
 * @description Hook to manage chat dialog configurations.
 * @returns Dialog state and CRUD functions
 */
export function useChatDialogs(): UseChatDialogsReturn {
  const { t } = useTranslation()

  const [dialogs, setDialogs] = useState<ChatDialog[]>([])
  const [loading, setLoading] = useState(false)
  const [activeDialogId, setActiveDialogId] = useState<string | null>(null)

  /**
   * Fetch all dialogs from the API.
   */
  const fetchDialogs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await chatApi.listDialogs()
      setDialogs(data)
      // Auto-select first dialog if none is active
      if (!activeDialogId && data.length > 0) {
        setActiveDialogId(data[0]!.id)
      }
    } catch (error) {
      console.error('Error fetching dialogs:', error)
    } finally {
      setLoading(false)
    }
  }, [activeDialogId])

  // Fetch dialogs on mount
  useEffect(() => {
    fetchDialogs()
  }, [fetchDialogs])

  /**
   * Get the active dialog object.
   */
  const activeDialog = dialogs.find((d) => d.id === activeDialogId) || null

  /**
   * Create a new dialog.
   * @param data - Dialog creation payload
   * @returns The created dialog or null on failure
   */
  const createDialog = useCallback(
    async (data: CreateDialogPayload): Promise<ChatDialog | null> => {
      try {
        const dialog = await chatApi.createDialog(data)
        setDialogs((prev) => [dialog, ...prev])
        setActiveDialogId(dialog.id)
        globalMessage.success(t('common.createSuccess'))
        return dialog
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'))
        return null
      }
    },
    [t],
  )

  /**
   * Delete a dialog by ID.
   * @param id - Dialog identifier
   */
  const deleteDialog = useCallback(
    async (id: string) => {
      try {
        await chatApi.deleteDialog(id)
        setDialogs((prev) => prev.filter((d) => d.id !== id))
        if (activeDialogId === id) {
          setActiveDialogId(null)
        }
        globalMessage.success(t('common.deleteSuccess'))
      } catch (error: any) {
        globalMessage.error(error?.message || t('common.error'))
      }
    },
    [activeDialogId, t],
  )

  return {
    dialogs,
    loading,
    activeDialog,
    setActiveDialogId,
    createDialog,
    deleteDialog,
    refresh: fetchDialogs,
  }
}
