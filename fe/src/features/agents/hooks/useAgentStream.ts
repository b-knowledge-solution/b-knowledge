/**
 * @fileoverview SSE streaming hook for agent run output.
 *
 * Creates an EventSource connection to the agent run stream endpoint
 * and accumulates output text deltas. Follows the same useState + useRef
 * imperative pattern as useChatStream.ts.
 *
 * @module features/agents/hooks/useAgentStream
 */

import { useState, useRef, useEffect } from 'react'
import { config } from '@/config'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Return type for the useAgentStream hook
 */
export interface UseAgentStreamReturn {
  /** Accumulated output text from the agent run */
  output: string
  /** Whether the SSE stream is currently active */
  isStreaming: boolean
  /** Error message if the stream encountered an error */
  error: string | null
  /** Start streaming output from a specific run */
  startStream: (agentId: string, runId: string) => void
  /** Stop the current stream */
  stopStream: () => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook for SSE streaming of agent run output. Connects to the
 *   /api/agents/:agentId/run/:runId/stream endpoint via EventSource and
 *   accumulates delta text tokens in real time.
 * @returns {UseAgentStreamReturn} Streaming state and control functions
 */
export function useAgentStream(): UseAgentStreamReturn {
  const [output, setOutput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs to track current state across event handler closures
  const outputRef = useRef('')
  const eventSourceRef = useRef<EventSource | null>(null)

  /**
   * @description Start an SSE stream for a given agent run. Closes any existing stream first.
   * @param {string} agentId - Agent UUID
   * @param {string} runId - Run UUID to stream output from
   */
  const startStream = (agentId: string, runId: string) => {
    // Close any existing stream before starting a new one
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    // Reset state for new stream
    setOutput('')
    setError(null)
    setIsStreaming(true)
    outputRef.current = ''

    // Build the SSE endpoint URL
    const baseUrl = config.apiBaseUrl || ''
    const url = `${baseUrl}/api/agents/${agentId}/run/${runId}/stream`

    const es = new EventSource(url, { withCredentials: true })
    eventSourceRef.current = es

    // Handle incoming SSE messages
    es.onmessage = (event) => {
      const dataStr = event.data

      // Handle completion signal
      if (dataStr === '[DONE]') {
        setIsStreaming(false)
        es.close()
        eventSourceRef.current = null
        return
      }

      try {
        const data = JSON.parse(dataStr)

        // Accumulate delta text tokens
        if (data.delta !== undefined) {
          outputRef.current += data.delta
          setOutput(outputRef.current)
        }

        // Handle step completion output
        if (data.output_data?.output !== undefined) {
          outputRef.current += String(data.output_data.output)
          setOutput(outputRef.current)
        }

        // Handle final done/error events
        if (data.type === 'done' || data.type === 'error') {
          if (data.output) {
            outputRef.current = String(data.output)
            setOutput(outputRef.current)
          }
          if (data.error) {
            setError(String(data.error))
          }
          setIsStreaming(false)
          es.close()
          eventSourceRef.current = null
        }
      } catch {
        // Skip malformed JSON lines
      }
    }

    // Handle EventSource connection errors
    es.onerror = () => {
      setError('Stream connection error')
      setIsStreaming(false)
      es.close()
      eventSourceRef.current = null
    }
  }

  /**
   * @description Stop the current SSE stream and preserve accumulated output.
   */
  const stopStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsStreaming(false)
  }

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  return { output, isStreaming, error, startStream, stopStream }
}
