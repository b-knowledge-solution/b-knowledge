/**
 * @fileoverview Root component for the embeddable search widget.
 * Supports dual modes:
 * - Internal: React component within B-Knowledge (session auth)
 * - External: IIFE bundle for third-party sites (token auth)
 *
 * @module features/search-widget/SearchWidget
 */

import { useState, useRef } from 'react'
import { SearchWidgetBar } from './SearchWidgetBar'
import { SearchWidgetResults } from './SearchWidgetResults'
import { createSearchWidgetApi } from './searchWidgetApi'
import type { WidgetApiConfig } from '@/lib/widgetAuth'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Shape of a search result chunk used within the widget.
 */
interface ChunkData {
  /** Chunk unique identifier */
  chunk_id: string
  /** Text content of the chunk */
  text: string
  /** Parent document identifier */
  doc_id: string
  /** Document file name */
  doc_name: string
  /** Relevance score (0-1) */
  score: number
}

/**
 * @description Props for the SearchWidget component.
 */
export interface SearchWidgetProps {
  /** Auth mode: 'internal' uses session, 'external' uses token */
  mode: 'internal' | 'external'
  /** App ID (required for internal mode) */
  appId?: string | undefined
  /** Embed token (required for external mode) */
  token?: string | undefined
  /** Base URL of the B-Knowledge API (required for external mode) */
  baseUrl?: string | undefined
  /** Placeholder text for the search bar */
  placeholder?: string | undefined
}

// ============================================================================
// SSE Parser Helper
// ============================================================================

/**
 * @description Parses SSE events from a ReadableStream and dispatches to typed callbacks.
 * Handles delta tokens, status updates, reference data, final answers, and errors.
 * @param {Response} response - Fetch response with SSE body
 * @param {object} callbacks - Event handlers for different SSE data types
 */
async function consumeSSE(
  response: Response,
  callbacks: {
    onDelta: (text: string) => void
    onStatus: (status: string) => void
    onReference: (ref: { chunks: ChunkData[] }) => void
    onFinal: (data: {
      answer: string
      reference?: { chunks: ChunkData[] }
      related_questions?: string[]
    }) => void
    onError: (msg: string) => void
    onDone: () => void
  }
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE lines
    const lines = buffer.split('\n')
    // Keep incomplete last line in buffer
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()

      if (payload === '[DONE]') {
        callbacks.onDone()
        return
      }

      try {
        const data = JSON.parse(payload)

        // Dispatch to the appropriate callback based on the SSE event type
        if (data.error) {
          callbacks.onError(data.error)
        } else if (data.delta) {
          callbacks.onDelta(data.delta)
        } else if (data.status) {
          callbacks.onStatus(data.status)
        } else if (data.reference && !data.answer) {
          callbacks.onReference(data.reference)
        } else if (data.answer !== undefined) {
          callbacks.onFinal(data)
        }
      } catch {
        // Skip unparseable JSON lines (e.g., partial SSE frames)
      }
    }
  }

  callbacks.onDone()
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Embeddable search widget with compact search bar and results overlay.
 * Supports internal (session auth) and external (token auth) modes.
 * @param {SearchWidgetProps} props - Widget configuration props
 * @returns {JSX.Element} The rendered search widget
 */
export function SearchWidget({ mode, appId, token, baseUrl, placeholder }: SearchWidgetProps) {
  // State
  const [answer, setAnswer] = useState('')
  const [chunks, setChunks] = useState<ChunkData[]>([])
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState('')

  // Select auth strategy based on widget mode: token for external, session for internal
  const apiConfig: WidgetApiConfig = mode === 'external' && token
    ? { token, baseUrl: baseUrl || '' }
    : {}
  // API client persists across renders via ref
  const apiRef = useRef(createSearchWidgetApi(apiConfig))

  /**
   * @description Execute a search query via SSE streaming.
   * @param {string} query - The search query string
   */
  const handleSearch = async (query: string) => {
    // Reset state for new search
    setAnswer('')
    setChunks([])
    setRelatedQuestions([])
    setPipelineStatus('')
    setIsSearching(true)

    try {
      // Initiate SSE streaming request via the widget API
      const response = await apiRef.current.askSearch(query, undefined, appId)

      // Check for HTTP-level errors before processing the stream
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `Search failed: ${response.status}`)
      }

      // Consume the SSE stream and update state via callbacks
      await consumeSSE(response, {
        onDelta: (text) => setAnswer((prev) => prev + text),
        onStatus: (status) => setPipelineStatus(status),
        onReference: (ref) => setChunks(ref.chunks || []),
        onFinal: (data) => {
          if (data.answer) setAnswer(data.answer)
          if (data.reference?.chunks) setChunks(data.reference.chunks)
          if (data.related_questions) setRelatedQuestions(data.related_questions)
        },
        onError: (msg) => setAnswer(`Error: ${msg}`),
        onDone: () => setIsSearching(false),
      })
    } catch (err) {
      setAnswer(`Error: ${(err as Error).message}`)
      setIsSearching(false)
    }
  }

  return (
    <div
      className="bk-search-widget"
      style={{
        width: '100%',
        maxWidth: '640px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <SearchWidgetBar
        onSearch={handleSearch}
        isSearching={isSearching}
        placeholder={placeholder}
      />
      <SearchWidgetResults
        answer={answer}
        chunks={chunks}
        relatedQuestions={relatedQuestions}
        isStreaming={isSearching}
        pipelineStatus={pipelineStatus}
        onFollowUp={handleSearch}
      />
    </div>
  )
}
