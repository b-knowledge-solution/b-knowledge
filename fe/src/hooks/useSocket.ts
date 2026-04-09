/**
 * @fileoverview React hooks for Socket.IO integration.
 *
 * Provides three hooks:
 * - `useSocketStatus` — reactive connection status
 * - `useSocketEvent` — subscribe to a socket event with automatic cleanup
 * - `useSocketQueryInvalidation` — map socket events to TanStack Query invalidations
 *
 * @module hooks/useSocket
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SOCKET_EVENTS } from '@/constants/socket-events'
import {
  getSocket,
  getSocketStatus,
  type SocketStatus,
} from '@/lib/socket'
import { queryKeys } from '@/lib/queryKeys'

// ============================================================================
// useSocketStatus
// ============================================================================

/**
 * @description Tracks the current Socket.IO connection status reactively by listening to connect, disconnect, and error events
 * @returns {SocketStatus} The current socket connection status
 */
export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>(getSocketStatus)

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    // Handler for when the socket connects
    const onConnect = () => setStatus('connected')
    // Handler for when the socket disconnects
    const onDisconnect = () => setStatus('disconnected')
    // Handler for connection errors
    const onError = () => setStatus('error')
    // Handler for reconnection attempts
    const onReconnecting = () => setStatus('connecting')

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onError)
    socket.on('reconnect_attempt', onReconnecting)

    // Sync initial status
    setStatus(socket.connected ? 'connected' : getSocketStatus())

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onError)
      socket.off('reconnect_attempt', onReconnecting)
    }
  }, [])

  return status
}

// ============================================================================
// useSocketEvent
// ============================================================================

/**
 * @description Subscribes to a specific Socket.IO event with automatic cleanup on unmount or event name change
 * @template T - Expected event payload type
 * @param {string} event - The socket event name to listen for
 * @param {(data: T) => void} callback - Handler invoked with the event payload
 *
 * @example
 * ```ts
 * useSocketEvent<NotificationPayload>('notification', (data) => {
 *   toast.info(data.message)
 * })
 * ```
 */
export function useSocketEvent<T = unknown>(
  event: string,
  callback: (data: T) => void,
): void {
  // Use a ref to keep the latest callback without re-subscribing
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    // Stable handler that delegates to the latest callback ref
    const handler = (data: T) => {
      callbackRef.current(data)
    }

    socket.on(event, handler)

    return () => {
      socket.off(event, handler)
    }
  }, [event])
}

// ============================================================================
// useSocketQueryInvalidation
// ============================================================================

/**
 * Default mapping from socket event names to TanStack Query key prefixes.
 * When a matching socket event fires, the corresponding query keys are
 * invalidated so the UI fetches fresh data.
 */
const DEFAULT_EVENT_KEY_MAP: Record<string, readonly (readonly string[])[]> = {
  'dataset:updated': [queryKeys.datasets.all],
  'document:updated': [queryKeys.datasets.all],
  'chunk:updated': [queryKeys.datasets.all],
  'converter:updated': [queryKeys.converter.all],
  'broadcast:updated': [queryKeys.broadcast.all],
  'chat:updated': [queryKeys.chat.all],
  'user:updated': [queryKeys.users.all],
  'team:updated': [queryKeys.teams.all],
  'glossary:updated': [queryKeys.glossary.all],
  'search:updated': [queryKeys.search.all],
  'llm-provider:updated': [queryKeys.llmProvider.all],
  'system:updated': [queryKeys.systemTools.all],
  'dashboard:updated': [queryKeys.dashboard.all],
  'histories:updated': [queryKeys.histories.all],
  [SOCKET_EVENTS.PERMISSIONS_CATALOG_UPDATED]: [queryKeys.permissions.catalog()],
}

/**
 * @description Automatically invalidates TanStack Query caches when matching socket events arrive, keeping UI in sync with server-side changes
 * @param {Record<string, readonly (readonly string[])[]>} [eventKeyMap] - Custom mapping of event names to query key arrays. Defaults to DEFAULT_EVENT_KEY_MAP.
 */
export function useSocketQueryInvalidation(
  eventKeyMap: Record<string, readonly (readonly string[])[]> = DEFAULT_EVENT_KEY_MAP,
): void {
  const queryClient = useQueryClient()

  // Keep map in a ref to avoid re-subscribing on every render
  const mapRef = useRef(eventKeyMap)
  mapRef.current = eventKeyMap

  /**
   * Invalidate all query keys associated with a given socket event.
   */
  const handleEvent = useCallback(
    (eventName: string) => {
      const keys = mapRef.current[eventName]
      if (!keys) return

      // Invalidate each query key prefix
      keys.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey: [...queryKey] })
      })
    },
    [queryClient],
  )

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return

    // Map of event name to its bound handler for cleanup
    const handlers: Record<string, () => void> = {}

    // Subscribe to each event in the map
    for (const eventName of Object.keys(mapRef.current)) {
      const handler = () => handleEvent(eventName)
      handlers[eventName] = handler
      socket.on(eventName, handler)
    }

    return () => {
      // Unsubscribe all handlers
      for (const [eventName, handler] of Object.entries(handlers)) {
        socket.off(eventName, handler)
      }
    }
  }, [handleEvent])
}
