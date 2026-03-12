/**
 * @fileoverview Hook for SSE-based chat streaming with delta token support.
 *
 * Handles three SSE event types from the backend:
 * - `{ delta: "token" }` — Incremental text token (append to current answer)
 * - `{ reference: {...} }` — Document references/citations
 * - `{ answer: "...", reference: {...}, metrics: {...} }` — Final processed answer
 * - `{ status: "..." }` — Pipeline status updates (retrieving, reranking, etc.)
 * - `{ error: "..." }` — Error message
 * - `[DONE]` — Stream completion signal
 *
 * @module features/ai/hooks/useChatStream
 */

import { useState, useRef } from 'react'
import { chatApi } from '../api/chatApi'
import type { ChatMessage, ChatReference } from '../types/chat.types'

// ============================================================================
// Types
// ============================================================================

/** Pipeline status sent during retrieval/processing phases */
export type PipelineStatus =
  | 'refining_question'
  | 'retrieving'
  | 'searching_web'
  | 'reranking'
  | 'generating'

/** Performance metrics from the RAG pipeline */
export interface PipelineMetrics {
  refinement_ms?: number
  retrieval_ms?: number
  generation_ms?: number
  total_ms?: number
  chunks_retrieved?: number
  chunks_cited?: number
}

/**
 * @description Return type for the useChatStream hook.
 */
export interface UseChatStreamReturn {
  /** All messages in the current conversation */
  messages: ChatMessage[]
  /** Whether a streaming response is in progress */
  isStreaming: boolean
  /** The partial answer being streamed (accumulated from deltas) */
  currentAnswer: string
  /** References extracted from the response */
  references: ChatReference | null
  /** Current pipeline status during processing */
  pipelineStatus: PipelineStatus | null
  /** Performance metrics from the last response */
  metrics: PipelineMetrics | null
  /** Send a user message and begin streaming */
  sendMessage: (content: string) => void
  /** Abort the current streaming response */
  stopStream: () => void
  /** Current error message if any */
  error: string | null
  /** Set messages externally (e.g. when loading a conversation) */
  setMessages: (messages: ChatMessage[]) => void
  /** Clear all messages */
  clearMessages: () => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook to manage SSE chat streaming with delta token support.
 * SSE streaming is imperative and does not use TanStack Query.
 * @param conversationId - The active conversation ID
 * @param dialogId - The dialog configuration ID
 * @returns Streaming state and control functions
 */
export function useChatStream(
  conversationId: string | null,
  dialogId: string | null,
): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [references, setReferences] = useState<ChatReference | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Abort controller reference for cancelling streams
  const abortRef = useRef<AbortController | null>(null)
  // Track accumulated answer across renders for the stop handler
  const answerRef = useRef('')

  /**
   * Send a user message and begin streaming the assistant response.
   * Uses delta streaming for efficient token-by-token display.
   * @param content - The user message text
   */
  const sendMessage = async (content: string) => {
    // Guard: require active conversation and dialog
    if (!conversationId || !dialogId) return

    // Reset state
    setError(null)
    setPipelineStatus(null)
    setMetrics(null)

    // Add user message to the list
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    // Begin streaming
    setIsStreaming(true)
    setCurrentAnswer('')
    setReferences(null)
    answerRef.current = ''

    try {
      // Create a new abort controller for this request
      abortRef.current = new AbortController()

      // Call the streaming endpoint
      const response = await chatApi.sendMessage(conversationId, content, dialogId)

      // Check for HTTP errors
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Chat error: ${response.status}`)
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

            // Handle delta tokens (incremental, append to current answer)
            if (data.delta !== undefined) {
              answerRef.current += data.delta
              setCurrentAnswer(answerRef.current)
              setPipelineStatus('generating')
            }

            // Handle pipeline status updates
            if (data.status !== undefined) {
              setPipelineStatus(data.status as PipelineStatus)
            }

            // Handle reference data (sent early for sidebar display)
            if (data.reference && !data.answer) {
              setReferences(data.reference)
            }

            // Handle final processed answer with citations
            if (data.answer !== undefined) {
              finalAnswer = data.answer
              // Update references with citation tracking
              if (data.reference) {
                setReferences(data.reference)
              }
              // Store metrics
              if (data.metrics) {
                setMetrics(data.metrics)
              }
            }

            // Handle errors from the pipeline
            if (data.error) {
              throw new Error(data.error)
            }
          } catch (parseErr: any) {
            // Re-throw actual errors (not JSON parse errors)
            if (parseErr.message && !parseErr.message.includes('JSON')) {
              throw parseErr
            }
            // Skip malformed JSON lines
          }
        }
      }

      // Use final processed answer (with citations) if available,
      // otherwise fall back to accumulated deltas
      const completedAnswer = finalAnswer || answerRef.current

      // Finalize: add assistant message with the complete answer
      if (completedAnswer) {
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: completedAnswer,
          timestamp: new Date().toISOString(),
          reference: references ?? undefined,
        }
        setMessages((prev) => [...prev, assistantMessage])
      }
      setCurrentAnswer('')
      answerRef.current = ''
    } catch (err: any) {
      // Handle abort (user cancelled)
      if (err.name === 'AbortError') return

      // Set error state
      const errorMsg = err.message || 'An error occurred while streaming'
      setError(errorMsg)

      // Add error as assistant message
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsStreaming(false)
      setPipelineStatus(null)
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
    setPipelineStatus(null)

    // Save partial answer as a message if any content was streamed
    if (answerRef.current) {
      const partialMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: answerRef.current,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, partialMessage])
      setCurrentAnswer('')
      answerRef.current = ''
    }
  }

  /**
   * Clear all messages.
   */
  const clearMessages = () => {
    setMessages([])
    setCurrentAnswer('')
    setReferences(null)
    setPipelineStatus(null)
    setMetrics(null)
    setError(null)
    answerRef.current = ''
  }

  return {
    messages,
    isStreaming,
    currentAnswer,
    references,
    pipelineStatus,
    metrics,
    sendMessage,
    stopStream,
    error,
    setMessages,
    clearMessages,
  }
}
