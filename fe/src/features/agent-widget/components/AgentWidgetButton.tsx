/**
 * @fileoverview Embeddable agent chat widget component.
 * Self-contained floating button + chat panel that can be embedded on external sites.
 * Uses agentWidgetApi for HTTP calls with embed token authentication.
 *
 * @module features/agent-widget/components/AgentWidgetButton
 */

import { useState, useRef, useEffect } from 'react'
import { agentWidgetApi, type AgentWidgetConfig } from '../api/agentWidgetApi'

/**
 * @description Props for the AgentWidgetButton component
 */
interface AgentWidgetButtonProps {
  /** UUID of the agent to embed */
  agentId: string
  /** Embed token for authentication */
  token: string
}

/**
 * @description Single chat message in the widget conversation
 */
interface WidgetMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * @description Embeddable agent chat widget with floating toggle button and slide-up chat panel.
 *   Self-contained: no dependency on main app state or React context providers.
 *   Communicates with the backend via embed token in URL path.
 *   Streams agent output via SSE using the Fetch API ReadableStream.
 * @param {AgentWidgetButtonProps} props - Agent ID and embed token
 * @returns {JSX.Element} Floating button with expandable chat panel
 */
export function AgentWidgetButton({ agentId, token }: AgentWidgetButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [config, setConfig] = useState<AgentWidgetConfig | null>(null)
  const [messages, setMessages] = useState<WidgetMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load agent config on mount for widget header display
  useEffect(() => {
    agentWidgetApi.getConfig(agentId, token)
      .then(setConfig)
      .catch(() => {
        // Silently fail — widget will show fallback header
      })
  }, [agentId, token])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /**
   * @description Sends user input to the agent and streams the response via SSE.
   *   Appends user message immediately, then streams assistant response token by token.
   */
  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    // Append user message to the conversation
    const userMsg: WidgetMessage = { role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)

    // Append empty assistant message to be filled by streaming
    const assistantIndex = messages.length + 1
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])

    try {
      const response = await agentWidgetApi.runAgent(agentId, trimmed, token)
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        // No stream body available — show error
        setMessages((prev) => {
          const updated = [...prev]
          updated[assistantIndex] = { role: 'assistant', content: 'Failed to connect to agent.' }
          return updated
        })
        setIsStreaming(false)
        return
      }

      // Read SSE chunks and accumulate assistant response
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE data lines
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            // Skip [DONE] sentinel
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data) as Record<string, unknown>
              // Accumulate text content from the SSE event
              const text = (parsed.content ?? parsed.output ?? parsed.text ?? '') as string
              if (text) {
                accumulated += text
                setMessages((prev) => {
                  const updated = [...prev]
                  updated[assistantIndex] = { role: 'assistant', content: accumulated }
                  return updated
                })
              }
            } catch {
              // Non-JSON data line — append raw text
              accumulated += data
              setMessages((prev) => {
                const updated = [...prev]
                updated[assistantIndex] = { role: 'assistant', content: accumulated }
                return updated
              })
            }
          }
        }
      }
    } catch (error) {
      // Show error in the assistant message slot
      setMessages((prev) => {
        const updated = [...prev]
        updated[assistantIndex] = {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Something went wrong'}`,
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Chat panel — visible when open */}
      {isOpen && (
        <div className="w-[380px] h-[520px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header: agent name and avatar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            {config?.avatar ? (
              <img
                src={config.avatar}
                alt={config.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold">
                {(config?.name ?? 'A').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {config?.name ?? 'Agent'}
              </div>
              {config?.description && (
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {config.description}
                </div>
              )}
            </div>
            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-sm text-gray-400 dark:text-gray-500 mt-8">
                Send a message to start the conversation.
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {msg.content || (isStreaming && idx === messages.length - 1 ? '...' : '')}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Submit on Enter key (not Shift+Enter for newlines)
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Type a message..."
                disabled={isStreaming}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim()}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center transition-transform hover:scale-105"
        aria-label={isOpen ? 'Close agent chat' : 'Open agent chat'}
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>
    </div>
  )
}
