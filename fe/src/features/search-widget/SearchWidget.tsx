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

interface ChunkData {
  chunk_id: string
  text: string
  doc_id: string
  doc_name: string
  score: number
}

/**
 * Props for the SearchWidget component.
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
 * Parse SSE events from a ReadableStream and invoke callbacks.
 * @param response - Fetch response with SSE body
 * @param callbacks - Event handlers for different SSE data types
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
        // Skip unparseable lines
      }
    }
  }

  callbacks.onDone()
}

// ============================================================================
// Component
// ============================================================================

/**
 * Embeddable search widget with compact search bar and results overlay.
 * @param props - Widget configuration props
 * @returns Search widget element
 */
export function SearchWidget({ mode, appId, token, baseUrl, placeholder }: SearchWidgetProps) {
  // State
  const [answer, setAnswer] = useState('')
  const [chunks, setChunks] = useState<ChunkData[]>([])
  const [relatedQuestions, setRelatedQuestions] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [pipelineStatus, setPipelineStatus] = useState('')

  // API client (created once based on config)
  const apiConfig: WidgetApiConfig = mode === 'external' && token
    ? { token, baseUrl: baseUrl || '' }
    : {}
  const apiRef = useRef(createSearchWidgetApi(apiConfig))

  /**
   * Execute a search query via SSE streaming.
   * @param query - The search query string
   */
  const handleSearch = async (query: string) => {
    // Reset state for new search
    setAnswer('')
    setChunks([])
    setRelatedQuestions([])
    setPipelineStatus('')
    setIsSearching(true)

    try {
      const response = await apiRef.current.askSearch(query, undefined, appId)

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `Search failed: ${response.status}`)
      }

      // Consume the SSE stream
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
