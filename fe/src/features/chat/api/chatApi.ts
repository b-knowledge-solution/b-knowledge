/**
 * @fileoverview API functions for the dataset chat feature.
 * Communicates with the backend chat and RAG endpoints.
 * @module features/chat/api/chatApi
 */

import { api } from '@/lib/api'
import type {
  ChatAssistant,
  ChatAssistantAccessEntry,
  Conversation,
  CreateAssistantPayload,
  CreateConversationPayload,
  SendMessageOptions,
} from '../types/chat.types'

/** Base URL for chat-related API endpoints */
const BASE_URL = '/api/chat'

/** Base URL for RAG API endpoints */
const RAG_URL = '/api/rag'

// ============================================================================
// Assistant CRUD
// ============================================================================

export const chatApi = {
  /**
   * List assistants with optional server-side pagination and search.
   * @param params - Optional pagination and filter parameters
   * @returns Paginated response with data array and total count
   */
  listAssistants: async (params?: {
    page?: number | undefined
    page_size?: number | undefined
    search?: string | undefined
    sort_by?: 'created_at' | 'name' | undefined
    sort_order?: 'asc' | 'desc' | undefined
  }): Promise<{ data: ChatAssistant[]; total: number }> => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.page_size) searchParams.set('page_size', String(params.page_size))
    if (params?.search) searchParams.set('search', params.search)
    if (params?.sort_by) searchParams.set('sort_by', params.sort_by)
    if (params?.sort_order) searchParams.set('sort_order', params.sort_order)
    const qs = searchParams.toString()
    return api.get<{ data: ChatAssistant[]; total: number }>(`${BASE_URL}/assistants${qs ? `?${qs}` : ''}`)
  },

  /**
   * Get a single assistant by ID.
   * @param id - Assistant identifier
   * @returns The chat assistant
   */
  getAssistant: async (id: string): Promise<ChatAssistant> => {
    return api.get<ChatAssistant>(`${BASE_URL}/assistants/${id}`)
  },

  /**
   * Create a new assistant.
   * @param data - Assistant creation payload
   * @returns The created assistant
   */
  createAssistant: async (data: CreateAssistantPayload): Promise<ChatAssistant> => {
    return api.post<ChatAssistant>(`${BASE_URL}/assistants`, data)
  },

  /**
   * Update an existing assistant.
   * @param id - Assistant identifier
   * @param data - Partial assistant data to update
   * @returns The updated assistant
   */
  updateAssistant: async (id: string, data: Partial<CreateAssistantPayload>): Promise<ChatAssistant> => {
    return api.put<ChatAssistant>(`${BASE_URL}/assistants/${id}`, data)
  },

  /**
   * Delete an assistant by ID.
   * @param id - Assistant identifier
   */
  deleteAssistant: async (id: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/assistants/${id}`)
  },

  // ============================================================================
  // Conversation CRUD
  // ============================================================================

  /**
   * List conversations for a given assistant.
   * @param assistantId - Parent assistant identifier
   * @returns Array of conversations
   */
  listConversations: async (assistantId: string): Promise<Conversation[]> => {
    return api.get<Conversation[]>(`${BASE_URL}/assistants/${assistantId}/conversations`)
  },

  /**
   * Get a single conversation with messages.
   * @param conversationId - Conversation identifier
   * @returns The conversation with messages
   */
  getConversation: async (conversationId: string): Promise<Conversation> => {
    return api.get<Conversation>(`${BASE_URL}/conversations/${conversationId}`)
  },

  /**
   * Create a new conversation under an assistant.
   * @param data - Conversation creation payload
   * @returns The created conversation
   */
  createConversation: async (data: CreateConversationPayload): Promise<Conversation> => {
    return api.post<Conversation>(`${BASE_URL}/conversations`, data)
  },

  /**
   * Delete a conversation by ID.
   * @param id - Conversation identifier
   */
  deleteConversation: async (id: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/conversations/${id}`)
  },

  /**
   * Rename a conversation.
   * @param conversationId - Conversation identifier
   * @param name - New display name
   * @returns The updated conversation
   */
  renameConversation: async (conversationId: string, name: string): Promise<Conversation> => {
    return api.put<Conversation>(`${BASE_URL}/conversations/${conversationId}`, { name })
  },

  /**
   * Delete multiple conversations.
   * @param ids - Array of conversation identifiers
   */
  deleteConversations: async (ids: string[]): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/conversations`, {
      body: JSON.stringify({ ids }),
      headers: { 'Content-Type': 'application/json' },
    })
  },

  // ============================================================================
  // Message Operations
  // ============================================================================

  /**
   * Delete a specific message from a conversation.
   * Used during message regeneration to remove the old assistant response.
   * @param conversationId - Parent conversation identifier
   * @param messageId - Message identifier to delete
   */
  deleteMessage: async (conversationId: string, messageId: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/conversations/${conversationId}/messages/${messageId}`)
  },

  /**
   * Send feedback (thumbs up/down) on an assistant message.
   * @param conversationId - Conversation identifier
   * @param messageId - Message identifier
   * @param thumbup - True for positive, false for negative
   * @param feedback - Optional text feedback
   */
  sendFeedback: async (
    conversationId: string,
    messageId: string,
    thumbup: boolean,
    feedback?: string,
  ): Promise<void> => {
    await api.post(`${BASE_URL}/conversations/${conversationId}/feedback`, {
      message_id: messageId,
      thumbup,
      feedback,
    })
  },

  // ============================================================================
  // Chat Completion (Streaming)
  // ============================================================================

  /**
   * Send a chat message and receive a streaming SSE response.
   * Returns the raw Response for the caller to consume as a ReadableStream.
   * @param conversationId - Conversation to send the message in
   * @param content - User message text
   * @param assistantId - Assistant configuration to use
   * @param options - Optional variables, reasoning, and internet search flags
   * @returns Raw fetch Response with SSE body
   */
  sendMessage: async (
    conversationId: string,
    content: string,
    assistantId: string,
    options?: SendMessageOptions,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const url = `${apiBase}${BASE_URL}/conversations/${conversationId}/completion`

    // Build request body with optional fields
    const body: Record<string, unknown> = {
      content,
      dialog_id: assistantId,
    }

    // Include custom variable values when provided
    if (options?.variables && Object.keys(options.variables).length > 0) {
      body.variables = options.variables
    }

    // Include reasoning flag when enabled
    if (options?.reasoning) {
      body.reasoning = true
    }

    // Include internet search flag when enabled
    if (options?.useInternet) {
      body.use_internet = true
    }

    // Include file attachment IDs when provided
    if (options?.file_ids && options.file_ids.length > 0) {
      body.file_ids = options.file_ids
    }

    // Use raw fetch for streaming support
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    })

    return response
  },

  // ============================================================================
  // File Uploads
  // ============================================================================

  /**
   * Upload files to a chat conversation.
   * @param conversationId - Conversation to attach files to
   * @param formData - FormData with 'files' field
   * @returns Array of uploaded file metadata
   */
  uploadChatFiles: async (
    conversationId: string,
    formData: FormData,
  ): Promise<{ id: string; original_name: string; mime_type: string; size: number }[]> => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const url = `${apiBase}${BASE_URL}/conversations/${conversationId}/files`

    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      throw new Error(errData.error || `Upload failed: ${response.status}`)
    }

    return response.json()
  },

  // ============================================================================
  // Assistant Access Control
  // ============================================================================

  /**
   * Get access entries (users and teams) for an assistant.
   * @param assistantId - Assistant identifier
   * @returns Array of access entries
   */
  getAssistantAccess: async (assistantId: string): Promise<ChatAssistantAccessEntry[]> => {
    return api.get<ChatAssistantAccessEntry[]>(`${BASE_URL}/assistants/${assistantId}/access`)
  },

  /**
   * Set access entries (users and teams) for an assistant.
   * @param assistantId - Assistant identifier
   * @param entries - Array of access entries to assign
   * @returns Updated access entries
   */
  setAssistantAccess: async (assistantId: string, entries: ChatAssistantAccessEntry[]): Promise<ChatAssistantAccessEntry[]> => {
    return api.put<ChatAssistantAccessEntry[]>(`${BASE_URL}/assistants/${assistantId}/access`, { entries })
  },

  // ============================================================================
  // Knowledge Base (for assistant config)
  // ============================================================================

  /**
   * List available datasets/knowledge bases for assistant configuration.
   * @returns Array of datasets
   */
  listDatasets: async (): Promise<{ id: string; name: string }[]> => {
    return api.get<{ id: string; name: string }[]>(`${RAG_URL}/datasets`)
  },

  // ============================================================================
  // Text-to-Speech
  // ============================================================================

  /**
   * Convert text to speech audio.
   * @param text - Text to synthesize
   * @param options - TTS options (voice, speed)
   * @returns Audio blob
   */
  tts: async (text: string, options?: { voice?: string; speed?: number }): Promise<Blob> => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const url = `${apiBase}${BASE_URL}/tts`

    // Use raw fetch to receive binary audio data
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, ...options }),
    })

    if (!response.ok) {
      throw new Error(`TTS request failed: ${response.status}`)
    }

    return response.blob()
  },
}
