/**
 * @fileoverview Chat widget root component.
 * Manages open/close state, session creation, and message streaming.
 * Supports both internal (session auth) and external (API key) modes.
 *
 * Internal usage (React component):
 * ```tsx
 * <ChatWidget mode="internal" dialogId="..." position="bottom-right" />
 * ```
 *
 * External usage (IIFE bundle):
 * ```js
 * BKnowledgeChat.init({ token: '...', baseUrl: '...', position: 'bottom-right' })
 * ```
 *
 * @module features/chat-widget/ChatWidget
 */

import { useState, useRef, useEffect } from 'react'
import ChatWidgetButton from './ChatWidgetButton'
import ChatWidgetWindow, { type WidgetMessage } from './ChatWidgetWindow'
import { ChatWidgetApi, type WidgetDialogInfo, type WidgetSession } from './chatWidgetApi'
import type { WidgetAuthMode } from '@/lib/widgetAuth'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Configuration props for the ChatWidget root component.
 */
interface ChatWidgetProps {
  /** Authentication mode */
  mode: WidgetAuthMode
  /** Dialog ID (required for internal mode) */
  dialogId?: string | undefined
  /** Embed token (required for external mode) */
  token?: string | undefined
  /** API base URL (external mode) */
  baseUrl?: string | undefined
  /** Button/window position */
  position?: 'bottom-right' | 'bottom-left'
  /** Theme preference */
  theme?: 'light' | 'dark' | 'auto'
}

// ============================================================================
// SSE Stream Parser
// ============================================================================

/**
 * @description Pipeline status during retrieval/generation phases of the RAG pipeline.
 */
type PipelineStatus =
  | 'refining_question'
  | 'retrieving'
  | 'searching_web'
  | 'reranking'
  | 'generating'

/**
 * @description Map pipeline status enum to a human-readable label for display.
 * @param status - Current pipeline status or null
 * @returns Human-readable status string or null if no status
 */
function getStatusLabel(status: PipelineStatus | null): string | null {
  switch (status) {
    case 'refining_question': return 'Refining question...'
    case 'retrieving': return 'Searching knowledge base...'
    case 'searching_web': return 'Searching the web...'
    case 'reranking': return 'Ranking results...'
    case 'generating': return 'Generating answer...'
    default: return null
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Chat widget root component. Renders the floating button and chat window.
 * Manages session lifecycle, message state, and SSE streaming.
 *
 * @param {ChatWidgetProps} props - Widget configuration props
 * @returns {JSX.Element} The rendered chat widget with FAB button and overlay window
 */
export default function ChatWidget({
  mode,
  dialogId,
  token,
  baseUrl,
  position = 'bottom-right',
  theme,
}: ChatWidgetProps) {
  // UI state
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)

  // Data state
  const [dialogInfo, setDialogInfo] = useState<WidgetDialogInfo | null>(null)
  const [session, setSession] = useState<WidgetSession | null>(null)

  // Refs
  const apiRef = useRef<ChatWidgetApi | null>(null)
  const answerRef = useRef('')

  // Initialize API client
  useEffect(() => {
    const config = mode === 'external'
      ? { token, baseUrl }
      : {}

    apiRef.current = new ChatWidgetApi(config, dialogId)
  }, [mode, dialogId, token, baseUrl])

  // Fetch dialog info when widget opens for the first time
  useEffect(() => {
    if (isOpen && !dialogInfo && apiRef.current) {
      apiRef.current.getInfo().then(setDialogInfo).catch(() => {
        // Silently fail — header will show 'Chat' as fallback
      })
    }
  }, [isOpen, dialogInfo])

  // Apply theme class to widget container
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark')
    }
    // 'auto' follows system preference (default behavior)
  }, [theme])

  // Reset unread count when opening
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0)
    }
  }, [isOpen])

  /**
   * @description Send a user message and begin streaming the assistant response.
   * Creates a session on first message, then streams SSE tokens.
   * @param content - The user message text
   */
  const handleSendMessage = async (content: string) => {
    if (!apiRef.current || isStreaming) return

    // Reset streaming state
    setIsStreaming(true)
    setCurrentAnswer('')
    setPipelineStatus(null)
    answerRef.current = ''

    // Add user message to the list
    const userMessage: WidgetMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      // Create session on first message
      let currentSession = session
      if (!currentSession) {
        currentSession = await apiRef.current.createSession(content.slice(0, 100))
        setSession(currentSession)
      }

      // Send message and get SSE stream
      const response = await apiRef.current.sendMessage(content, currentSession.id)

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        accumulated += decoder.decode(value, { stream: true })

        // Parse SSE data lines
        const lines = accumulated.split('\n')
        accumulated = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data:')) continue

          const dataStr = line.slice(5).trim()
          if (dataStr === '[DONE]') continue

          try {
            const data = JSON.parse(dataStr)

            // Handle delta tokens
            if (data.delta !== undefined) {
              answerRef.current += data.delta
              setCurrentAnswer(answerRef.current)
              setPipelineStatus('generating')
            }

            // Handle pipeline status updates
            if (data.status !== undefined) {
              setPipelineStatus(data.status as PipelineStatus)
            }

            // Handle final processed answer
            if (data.answer !== undefined) {
              finalAnswer = data.answer
            }

            // Handle errors
            if (data.error) {
              throw new Error(data.error)
            }
          } catch (parseErr: unknown) {
            const errMsg = parseErr instanceof Error ? parseErr.message : ''
            if (errMsg && !errMsg.includes('JSON')) {
              throw parseErr
            }
          }
        }
      }

      // Use final answer or accumulated deltas
      const completedAnswer = finalAnswer || answerRef.current

      if (completedAnswer) {
        const assistantMessage: WidgetMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: completedAnswer,
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, assistantMessage])

        // Increment unread if window is not open
        if (!isOpen) {
          setUnreadCount((prev) => prev + 1)
        }
      }

      setCurrentAnswer('')
      answerRef.current = ''
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return

      const errorMsg = err instanceof Error ? err.message : 'An error occurred'

      const errorMessage: WidgetMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsStreaming(false)
      setPipelineStatus(null)
    }
  }

  return (
    <>
      <ChatWidgetWindow
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        dialogInfo={dialogInfo}
        messages={messages}
        isStreaming={isStreaming}
        currentAnswer={currentAnswer}
        onSendMessage={handleSendMessage}
        position={position}
        statusLabel={getStatusLabel(pipelineStatus)}
      />
      <ChatWidgetButton
        isOpen={isOpen}
        onToggle={() => setIsOpen((prev) => !prev)}
        unreadCount={unreadCount}
        position={position}
      />
    </>
  )
}
