/**
 * @fileoverview TanStack Query hooks for broadcast message data fetching and mutations.
 * @module features/broadcast/api/broadcastQueries
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryKeys } from '@/lib/queryKeys'
import { broadcastMessageService } from './broadcastApi'
import type { BroadcastMessage } from '../types/broadcast.types'

/**
 * @description Fetch all broadcast messages (admin use).
 * @returns TanStack Query result with all broadcast messages
 */
export function useBroadcastMessages() {
  return useQuery({
    queryKey: queryKeys.broadcast.list(),
    queryFn: broadcastMessageService.getAllMessages,
  })
}

/**
 * @description Fetch currently active broadcast messages (public use).
 * @returns TanStack Query result with active broadcast messages
 */
export function useActiveBroadcastMessages() {
  return useQuery<BroadcastMessage[]>({
    queryKey: queryKeys.broadcast.active(),
    queryFn: () => broadcastMessageService.getActiveMessages(),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * @description Mutation hook for creating or updating a broadcast message.
 * Invalidates the broadcast list cache on success.
 * @returns TanStack Mutation result for save operations
 */
export function useSaveBroadcastMessage() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationKey: ['save', 'broadcastMessage'],
    mutationFn: (msg: Partial<BroadcastMessage>) => {
      // Determine create vs update based on presence of an existing ID
      if (msg.id) {
        return broadcastMessageService.updateMessage(msg.id, msg)
      }
      return broadcastMessageService.createMessage(msg as Omit<BroadcastMessage, 'id' | 'created_at' | 'updated_at'>)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.broadcast.list() })
    },
    meta: { successMessage: t('admin.broadcast.saveSuccess') },
  })
}

/**
 * @description Mutation hook for deleting a broadcast message.
 * Invalidates the broadcast list cache on success.
 * @returns TanStack Mutation result for delete operations
 */
export function useDeleteBroadcastMessage() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationKey: ['delete', 'broadcastMessage'],
    mutationFn: broadcastMessageService.deleteMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.broadcast.list() })
    },
    meta: { successMessage: t('admin.broadcast.deleteSuccess') },
  })
}
