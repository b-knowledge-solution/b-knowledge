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
 * @description Optional API overrides for the search stream hook.
 * When provided, the hook uses these functions instead of the default searchApi calls.
 * Used by the embed share page to inject token-authenticated API calls.
 */
export interface SearchStreamApiOverrides {
  /** Override for the SSE streaming search endpoint */
  askSearch: (appId: string, query: string, filters: SearchFilters | Record<string, unknown>, signal?: AbortSignal) => Promise<Response>
}

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
  /** Total number of matching results from the server */
  total: number
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
 * Accepts optional API overrides to support embed/share pages with token-based auth.
 * @param {SearchStreamApiOverrides} [apiOverrides] - Optional API function overrides for embed mode
 * @returns {UseSearchStreamReturn} Streaming state and control functions
 */
export function useSearchStream(apiOverrides?: SearchStreamApiOverrides): UseSearchStreamReturn {
  const [answer, setAnswer] = useState('')
  const [chunks, setChunks] = useState<SearchResult[]>([])
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [docAggs, setDocAggs] = useState<Array<{ doc_id: string; doc_name: string; count: number }>>([])
  const [total, setTotal] = useState(0)
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
    setTotal(0)
    setLastQuery(query)
    setIsStreaming(true)
    answerRef.current = ''

    try {
      // Create a new abort controller for this request
      abortRef.current = new AbortController()

      // Call the streaming endpoint — use override if provided (embed mode), otherwise default API
      const response = apiOverrides
        ? await apiOverrides.askSearch(searchAppId, query, filters ?? {}, abortRef.current.signal)
        : await searchApi.askSearch(searchAppId, query, filters, abortRef.current.signal)

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

          // Handle completion signal — clear status immediately
          if (dataStr === '[DONE]') {
            setPipelineStatus('')
            continue
          }

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
                // Map backend kb_id to frontend dataset_id for document preview
                setChunks(data.reference.chunks.map((c: any) => ({
                  ...c,
                  dataset_id: c.dataset_id || c.kb_id || '',
                })))
              }
              if (data.reference.doc_aggs) {
                setDocAggs(data.reference.doc_aggs)
              }
              if (data.reference.total !== undefined) {
                setTotal(data.reference.total)
              }
            }

            // Handle final processed answer (may arrive as string or object with nested text)
            if (data.answer !== undefined) {
              finalAnswer = typeof data.answer === 'string' ? data.answer : ''
              if (data.reference?.chunks) {
                // Map backend kb_id to frontend dataset_id for document preview
                setChunks(data.reference.chunks.map((c: any) => ({
                  ...c,
                  dataset_id: c.dataset_id || c.kb_id || '',
                })))
              }
              if (data.reference?.doc_aggs) {
                setDocAggs(data.reference.doc_aggs)
              }
              if (data.total !== undefined) {
                setTotal(data.total)
              }
              if (data.reference?.total !== undefined) {
                setTotal(data.reference.total)
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
            // Skip JSON parse errors from malformed SSE lines; re-throw real errors
            if (!(parseErr instanceof SyntaxError)) {
              throw parseErr
            }
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
    setTotal(0)
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
    total,
    askSearch,
    stopStream,
    clearResults,
    lastQuery,
  }
}
