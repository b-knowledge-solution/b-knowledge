/**
 * @fileoverview Hook for SSE-based chat streaming with delta token support.
 *
 * Handles three SSE event types from the backend:
 * - `{ delta: "token" }` -- Incremental text token (append to current answer)
 * - `{ reference: {...} }` -- Document references/citations
 * - `{ answer: "...", reference: {...}, metrics: {...} }` -- Final processed answer
 * - `{ status: "..." }` -- Pipeline status updates (retrieving, reranking, etc.)
 * - `{ error: "..." }` -- Error message
 * - `[DONE]` -- Stream completion signal
 *
 * @module features/chat/hooks/useChatStream
 */

import { useState, useRef } from 'react'
import { chatApi } from '../api/chatApi'
import type { ChatMessage, ChatReference, SendMessageOptions } from '../types/chat.types'

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
  sendMessage: (content: string, options?: SendMessageOptions) => void
  /** Abort the current streaming response */
  stopStream: () => void
  /** Current error message if any */
  error: string | null
  /** Set messages externally (e.g. when loading a conversation) */
  setMessages: (messages: ChatMessage[]) => void
  /** Clear all messages */
  clearMessages: () => void
  /** Regenerate the last assistant message by re-sending the last user message */
  regenerateLastMessage: () => void
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
  const referencesRef = useRef<ChatReference | null>(null)

  /**
   * Send a user message and begin streaming the assistant response.
   * Uses delta streaming for efficient token-by-token display.
   * @param content - The user message text
   * @param options - Optional variables, reasoning, and internet search flags
   */
  const sendMessage = async (content: string, options?: SendMessageOptions) => {
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

      // Call the streaming endpoint with optional parameters
      const response = await chatApi.sendMessage(conversationId, content, dialogId, options, abortRef.current.signal)

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
              referencesRef.current = data.reference
              setReferences(data.reference)
            }

            // Handle final processed answer with citations
            if (data.answer !== undefined) {
              finalAnswer = data.answer
              // Update references with citation tracking
              if (data.reference) {
                referencesRef.current = data.reference
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
          reference: referencesRef.current ?? undefined,
        }
        setMessages((prev) => [...prev, assistantMessage])
      }
      setCurrentAnswer('')
      answerRef.current = ''
    } catch (err: unknown) {
      // Handle abort (user cancelled)
      if (err instanceof Error && err.name === 'AbortError') return

      // Set error state
      const errorMsg = err instanceof Error ? err.message : 'An error occurred while streaming'
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
      referencesRef.current = null
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
    referencesRef.current = null
  }

  /**
   * Regenerate the last assistant message by removing it and re-sending
   * the last user message.
   */
  const regenerateLastMessage = () => {
    // Guard: cannot regenerate during streaming
    if (isStreaming) return

    // Find the last user message (iterate from end)
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') {
        lastUserIdx = i
        break
      }
    }
    if (lastUserIdx === -1) return

    const lastUserContent = messages[lastUserIdx]!.content

    // Find the last assistant message (iterate from end)
    let lastAssistantIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'assistant') {
        lastAssistantIdx = i
        break
      }
    }
    if (lastAssistantIdx > lastUserIdx) {
      // Delete the assistant message from backend if it has a real ID
      const assistantMsg = messages[lastAssistantIdx]!
      if (assistantMsg.id && conversationId && !assistantMsg.id.startsWith('assistant-') && !assistantMsg.id.startsWith('error-')) {
        chatApi.deleteMessage(conversationId, assistantMsg.id).catch(() => {
          // Best-effort deletion; proceed even on failure
        })
      }
    }

    // Remove both assistant and user messages in a single setMessages call
    // to avoid React batching issues where two separate calls run against the same prev
    const indicesToRemove = new Set<number>()
    if (lastAssistantIdx > lastUserIdx) indicesToRemove.add(lastAssistantIdx)
    indicesToRemove.add(lastUserIdx)
    setMessages((prev) => prev.filter((_, idx) => !indicesToRemove.has(idx)))

    // Re-send the user message
    sendMessage(lastUserContent)
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
    regenerateLastMessage,
  }
}
