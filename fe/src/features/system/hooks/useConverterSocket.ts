/**
 * @fileoverview useConverterSocket — real-time converter status updates via WebSocket.
 *
 * Listens for `converter:file:status` and `converter:job:status` events
 * from the backend Socket.IO server. Integrates with TanStack Query
 * to invalidate relevant queries on status changes.
 *
 * @module features/system/hooks/useConverterSocket
 */
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getSocket, connectSocket } from '@/lib/socket'

// ============================================================================
// Types
// ============================================================================

/** Payload for per-file status change events */
export interface FileStatusEvent {
  /** Parent version job ID */
  jobId: string
  /** File tracking record ID */
  fileId: string
  /** Original file name */
  fileName: string
  /** New status */
  status: 'finished' | 'failed'
}

/** Payload for version job status change events */
export interface JobStatusEvent {
  /** Version job ID */
  jobId: string
  /** Version ID */
  versionId: string
  /** New overall job status */
  status: 'finished' | 'failed'
  /** Total number of files */
  fileCount: number
  /** Successfully finished files */
  finishedCount: number
  /** Failed files */
  failedCount: number
}

/** Hook options */
export interface UseConverterSocketOptions {
  /** If true, the hook is active and listens for events */
  enabled?: boolean
  /** Called when any file status changes */
  onFileUpdate?: (data: FileStatusEvent) => void
  /** Called when a job status changes */
  onJobUpdate?: (data: JobStatusEvent) => void
  /** Additional query keys to invalidate on updates */
  invalidateKeys?: string[][]
}

// ============================================================================
// Hook
// ============================================================================

/**
 * React hook for real-time converter status updates via Socket.IO.
 * Automatically invalidates TanStack Query caches for converter data
 * when socket events arrive.
 *
 * @param options - Configuration and callbacks
 * @description Subscribes to converter WebSocket events. Automatically
 *   connects the socket if not already connected. Cleans up on unmount.
 *
 * @example
 * ```tsx
 * useConverterSocket({
 *   enabled: open,
 *   onJobUpdate: (data) => console.log('Job updated:', data),
 * })
 * ```
 */
export function useConverterSocket(options: UseConverterSocketOptions): void {
  const { enabled = true, onFileUpdate, onJobUpdate, invalidateKeys } = options
  const queryClient = useQueryClient()

  // Use refs to avoid re-subscribing when callbacks change
  const onFileRef = useRef(onFileUpdate)
  const onJobRef = useRef(onJobUpdate)
  onFileRef.current = onFileUpdate
  onJobRef.current = onJobUpdate

  useEffect(() => {
    if (!enabled) return

    // Ensure socket is connected
    let socket = getSocket()
    if (!socket) {
      socket = connectSocket()
    }

    // Handler for per-file status events
    const handleFileStatus = (data: FileStatusEvent) => {
      // Invoke optional callback
      onFileRef.current?.(data)
      // Invalidate converter queries so UI refreshes
      queryClient.invalidateQueries({ queryKey: ['converter'] })
      // Invalidate any additional keys provided by the consumer
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key })
        }
      }
    }

    // Handler for job-level status events
    const handleJobStatus = (data: JobStatusEvent) => {
      // Invoke optional callback
      onJobRef.current?.(data)
      // Invalidate converter queries so UI refreshes
      queryClient.invalidateQueries({ queryKey: ['converter'] })
      // Invalidate any additional keys provided by the consumer
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key })
        }
      }
    }

    socket.on('converter:file:status', handleFileStatus)
    socket.on('converter:job:status', handleJobStatus)

    return () => {
      socket?.off('converter:file:status', handleFileStatus)
      socket?.off('converter:job:status', handleJobStatus)
    }
  }, [enabled, queryClient, invalidateKeys])
}

export default useConverterSocket
