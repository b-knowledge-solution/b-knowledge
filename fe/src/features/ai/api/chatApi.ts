/**
 * @fileoverview API functions for the dataset chat feature.
 * Communicates with the backend chat and RAG endpoints.
 * @module features/ai/api/chatApi
 */

import { api } from '@/lib/api'
import type {
  ChatDialog,
  ChatDialogAccessEntry,
  Conversation,
  CreateDialogPayload,
  CreateConversationPayload,
} from '../types/chat.types'

/** Base URL for chat-related API endpoints */
const BASE_URL = '/api/chat'

/** Base URL for RAG API endpoints */
const RAG_URL = '/api/rag'

// ============================================================================
// Dialog CRUD
// ============================================================================

export const chatApi = {
  /**
   * List all dialogs (chat assistants) for the current user.
   * @returns Array of chat dialogs
   */
  listDialogs: async (): Promise<ChatDialog[]> => {
    return api.get<ChatDialog[]>(`${BASE_URL}/dialogs`)
  },

  /**
   * Get a single dialog by ID.
   * @param id - Dialog identifier
   * @returns The chat dialog
   */
  getDialog: async (id: string): Promise<ChatDialog> => {
    return api.get<ChatDialog>(`${BASE_URL}/dialogs/${id}`)
  },

  /**
   * Create a new dialog.
   * @param data - Dialog creation payload
   * @returns The created dialog
   */
  createDialog: async (data: CreateDialogPayload): Promise<ChatDialog> => {
    return api.post<ChatDialog>(`${BASE_URL}/dialogs`, data)
  },

  /**
   * Update an existing dialog.
   * @param id - Dialog identifier
   * @param data - Partial dialog data to update
   * @returns The updated dialog
   */
  updateDialog: async (id: string, data: Partial<CreateDialogPayload>): Promise<ChatDialog> => {
    return api.put<ChatDialog>(`${BASE_URL}/dialogs/${id}`, data)
  },

  /**
   * Delete a dialog by ID.
   * @param id - Dialog identifier
   */
  deleteDialog: async (id: string): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/dialogs/${id}`)
  },

  // ============================================================================
  // Conversation CRUD
  // ============================================================================

  /**
   * List conversations for a given dialog.
   * @param dialogId - Parent dialog identifier
   * @returns Array of conversations
   */
  listConversations: async (dialogId: string): Promise<Conversation[]> => {
    return api.get<Conversation[]>(`${BASE_URL}/dialogs/${dialogId}/conversations`)
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
   * Create a new conversation under a dialog.
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
   * Delete multiple conversations.
   * @param ids - Array of conversation identifiers
   */
  deleteConversations: async (ids: string[]): Promise<void> => {
    return api.delete<void>(`${BASE_URL}/sessions`, {
      body: JSON.stringify({ sessionIds: ids }),
      headers: { 'Content-Type': 'application/json' },
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
   * @param dialogId - Dialog configuration to use
   * @returns Raw fetch Response with SSE body
   */
  sendMessage: async (
    conversationId: string,
    content: string,
    dialogId: string,
  ): Promise<Response> => {
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const url = `${apiBase}${BASE_URL}/conversations/${conversationId}/completion`

    // Use raw fetch for streaming support
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ content, dialog_id: dialogId }),
    })

    return response
  },

  // ============================================================================
  // Dialog Access Control
  // ============================================================================

  /**
   * Get access entries (users and teams) for a dialog.
   * @param dialogId - Dialog identifier
   * @returns Array of access entries
   */
  getDialogAccess: async (dialogId: string): Promise<ChatDialogAccessEntry[]> => {
    return api.get<ChatDialogAccessEntry[]>(`${BASE_URL}/dialogs/${dialogId}/access`)
  },

  /**
   * Set access entries (users and teams) for a dialog.
   * @param dialogId - Dialog identifier
   * @param entries - Array of access entries to assign
   * @returns Updated access entries
   */
  setDialogAccess: async (dialogId: string, entries: ChatDialogAccessEntry[]): Promise<ChatDialogAccessEntry[]> => {
    return api.put<ChatDialogAccessEntry[]>(`${BASE_URL}/dialogs/${dialogId}/access`, { entries })
  },

  // ============================================================================
  // Knowledge Base (for dialog config)
  // ============================================================================

  /**
   * List available datasets/knowledge bases for dialog configuration.
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
