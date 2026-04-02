/**
 * @fileoverview SSE hook for real-time connector sync progress updates.
 * Subscribes to the backend SSE endpoint and provides live progress data.
 *
 * @module features/datasets/hooks/useSyncProgress
 */

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

/** @description Shape of a sync progress event received via SSE */
interface SyncProgressEvent {
  connector_id: string
  sync_log_id: string
  progress: number
  message: string
  status: 'running' | 'completed' | 'failed'
  docs_synced: number
  docs_failed: number
  docs_skipped: number
  docs_deleted: number
}

/** @description Return value from the useSyncProgress hook */
interface UseSyncProgressReturn {
  /** Current progress percentage (0-100, -1 for failure) */
  progress: number
  /** Current sync status */
  status: 'running' | 'completed' | 'failed' | null
  /** Human-readable progress message */
  message: string
  /** Whether the SSE connection is active */
  isConnected: boolean
}

/**
 * @description Hook that subscribes to real-time sync progress via SSE.
 *   Auto-closes on terminal status (completed/failed) and invalidates
 *   query caches when the sync finishes.
 * @param {string | null} connectorId - Connector UUID to subscribe to, or null to disable
 * @param {string} kbId - Knowledge base ID for cache invalidation
 * @returns {UseSyncProgressReturn} Live sync progress state
 */
export function useSyncProgress(connectorId: string | null, kbId: string): UseSyncProgressReturn {
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<'running' | 'completed' | 'failed' | null>(null)
  const [message, setMessage] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    // Skip if no connector ID
    if (!connectorId) return

    // Reset state for new subscription
    setProgress(0)
    setStatus('running')
    setMessage('')

    const url = `/api/sync/connectors/${connectorId}/progress`
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.onopen = () => {
      setIsConnected(true)
    }

    es.onmessage = (event) => {
      try {
        const data: SyncProgressEvent = JSON.parse(event.data)
        setProgress(data.progress)
        setMessage(data.message)

        // Handle terminal states
        if (data.status === 'completed' || data.status === 'failed') {
          setStatus(data.status)
          setIsConnected(false)
          es.close()
          esRef.current = null

          // Invalidate caches so the UI reflects final state
          queryClient.invalidateQueries({ queryKey: queryKeys.datasets.connectors(kbId) })
          queryClient.invalidateQueries({ queryKey: queryKeys.datasets.syncLogs(connectorId) })
        }
      } catch {
        // Ignore malformed messages
      }
    }

    es.onerror = () => {
      setIsConnected(false)
      es.close()
      esRef.current = null
    }

    // Cleanup on unmount or connectorId change
    return () => {
      es.close()
      esRef.current = null
      setIsConnected(false)
    }
  }, [connectorId, kbId, queryClient])

  return { progress, status, message, isConnected }
}
