/**
 * @fileoverview Hook for SSE-based search streaming with delta token support.
 *
 * Handles SSE event types from the search backend:
 * - `{ delta: "token" }` — Incremental text token (append to answer)
 * - `{ status: "..." }` — Pipeline status updates (retrieving, generating, etc.)
 * - `{ reference: {...} }` — Search result chunks
 * - `{ answer: "..." }` — Final processed answer
 * - `{ error: "..." }` — Error message
 * - `[DONE]` — Stream completion signal
 *
 * @module features/ai/hooks/useSearchStream
 */

import { useState, useRef } from 'react'
import { searchApi } from '../api/searchApi'
import type { SearchResult, SearchFilters } from '../types/search.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Return type for the useSearchStream hook.
 */
export interface UseSearchStreamReturn {
  /** Accumulated answer from delta tokens */
  answer: string
  /** Retrieved search result chunks */
  chunks: SearchResult[]
  /** Related follow-up questions */
  relatedQuestions: string[]
  /** Whether the SSE stream is active */
  isStreaming: boolean
  /** Current pipeline status (retrieving, generating, etc.) */
  pipelineStatus: string
  /** Error message if any */
  error: string | null
  /** Document aggregation counts */
  docAggs: Array<{ doc_id: string; doc_name: string; count: number }>
  /** Start a streaming search query */
  askSearch: (searchAppId: string, query: string, filters?: SearchFilters) => void
  /** Abort the current stream */
  stopStream: () => void
  /** Clear all results and reset state */
  clearResults: () => void
  /** The last query that was searched */
  lastQuery: string
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook to manage SSE streaming for search AI summary generation.
 * SSE streaming is imperative and does not use TanStack Query.
 * @returns Streaming state and control functions
 */
export function useSearchStream(): UseSearchStreamReturn {
  const [answer, setAnswer] = useState('')
  const [chunks, setChunks] = useState<SearchResult[]>([])
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [docAggs, setDocAggs] = useState<Array<{ doc_id: string; doc_name: string; count: number }>>([])
  const [lastQuery, setLastQuery] = useState('')

  // Abort controller reference for cancelling streams
  const abortRef = useRef<AbortController | null>(null)
  // Track accumulated answer across renders
  const answerRef = useRef('')

  /**
   * Start a streaming search query with SSE.
   * @param searchAppId - Search application ID
   * @param query - Search query text
   * @param filters - Optional search filters
   */
  const askSearch = async (searchAppId: string, query: string, filters?: SearchFilters) => {
    // Guard: require non-empty query
    if (!query.trim()) return

    // Reset state for new search
    setError(null)
    setPipelineStatus('')
    setAnswer('')
    setChunks([])
    setRelatedQuestions([])
    setDocAggs([])
    setLastQuery(query)
    setIsStreaming(true)
    answerRef.current = ''

    try {
      // Create a new abort controller for this request
      abortRef.current = new AbortController()

      // Call the streaming endpoint
      const response = await searchApi.askSearch(searchAppId, query, filters, abortRef.current.signal)

      // Check for HTTP errors
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Search error: ${response.status}`)
      }

      // Read the SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let accumulated = ''
      let finalAnswer = ''

      // Process the stream chunk by chunk
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Decode the received bytes
        accumulated += decoder.decode(value, { stream: true })

        // Parse SSE data lines
        const lines = accumulated.split('\n')
        // Keep the last incomplete line for the next iteration
        accumulated = lines.pop() || ''

        for (const line of lines) {
          // Skip empty lines and comments
          if (!line.startsWith('data:')) continue

          const dataStr = line.slice(5).trim()

          // Handle completion signal
          if (dataStr === '[DONE]') continue

          try {
            const data = JSON.parse(dataStr)

            // Handle delta tokens (incremental, append to answer)
            if (data.delta !== undefined) {
              answerRef.current += data.delta
              setAnswer(answerRef.current)
              setPipelineStatus('generating')
            }

            // Handle pipeline status updates
            if (data.status !== undefined) {
              setPipelineStatus(data.status)
            }

            // Handle reference data (search result chunks)
            if (data.reference && !data.answer) {
              if (data.reference.chunks) {
                setChunks(data.reference.chunks)
              }
              if (data.reference.doc_aggs) {
                setDocAggs(data.reference.doc_aggs)
              }
            }

            // Handle final processed answer
            if (data.answer !== undefined) {
              finalAnswer = data.answer
              if (data.reference?.chunks) {
                setChunks(data.reference.chunks)
              }
              if (data.reference?.doc_aggs) {
                setDocAggs(data.reference.doc_aggs)
              }
            }

            // Handle related questions
            if (data.related_questions) {
              setRelatedQuestions(data.related_questions)
            }

            // Handle errors from the pipeline
            if (data.error) {
              throw new Error(data.error)
            }
          } catch (parseErr: unknown) {
            // Re-throw actual errors (not JSON parse errors)
            const errMsg = parseErr instanceof Error ? parseErr.message : ''
            if (errMsg && !errMsg.includes('JSON')) {
              throw parseErr
            }
            // Skip malformed JSON lines
          }
        }
      }

      // Use final answer if available, otherwise accumulated deltas
      const completedAnswer = finalAnswer || answerRef.current
      if (completedAnswer) {
        setAnswer(completedAnswer)
      }
      answerRef.current = ''
    } catch (err: unknown) {
      // Handle abort (user cancelled)
      if (err instanceof Error && err.name === 'AbortError') return

      // Set error state
      const errorMsg = err instanceof Error ? err.message : 'An error occurred while searching'
      setError(errorMsg)
    } finally {
      setIsStreaming(false)
      setPipelineStatus('')
      abortRef.current = null
    }
  }

  /**
   * Abort the current streaming response.
   */
  const stopStream = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsStreaming(false)
    setPipelineStatus('')
  }

  /**
   * Clear all search results and reset state.
   */
  const clearResults = () => {
    setAnswer('')
    setChunks([])
    setRelatedQuestions([])
    setDocAggs([])
    setError(null)
    setPipelineStatus('')
    setLastQuery('')
    answerRef.current = ''
  }

  return {
    answer,
    chunks,
    relatedQuestions,
    isStreaming,
    pipelineStatus,
    error,
    docAggs,
    askSearch,
    stopStream,
    clearResults,
    lastQuery,
  }
}
