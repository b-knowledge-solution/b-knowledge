/**
 * @fileoverview API client for the chat widget.
 * Wraps createWidgetApiClient with chat-specific methods for both
 * internal (session cookie) and external (embed token) auth modes.
 *
 * @module features/chat-widget/chatWidgetApi
 */

import { createWidgetApiClient, type WidgetApiConfig } from '@/lib/widgetAuth'

// ============================================================================
// Types
// ============================================================================

/** Dialog info returned by the embed info endpoint */
export interface WidgetDialogInfo {
  name: string
  icon: string | null
  description: string | null
  prologue: string | null
}

/** Session created for the widget conversation */
export interface WidgetSession {
  id: string
  dialog_id: string
  name: string
}

// ============================================================================
// API Class
// ============================================================================

/**
 * Chat widget API client with dual-mode authentication.
 * In internal mode, uses session cookies with standard /api/chat endpoints.
 * In external mode, uses embed token with /api/chat/embed/:token endpoints.
 */
export class ChatWidgetApi {
  private client: ReturnType<typeof createWidgetApiClient>
  private dialogId: string | undefined

  /**
   * @param config - Widget API configuration
   * @param dialogId - Dialog ID (required for internal mode)
   */
  constructor(config: WidgetApiConfig, dialogId?: string) {
    this.client = createWidgetApiClient('chat', config)
    this.dialogId = dialogId
  }

  /**
   * Get dialog info for widget display (name, icon, prologue).
   * @returns Dialog info object
   */
  async getInfo(): Promise<WidgetDialogInfo> {
    if (this.client.mode === 'external') {
      // External: GET /api/chat/embed/:token/info
      return this.client.get<WidgetDialogInfo>('info')
    }
    // Internal: GET /api/chat/dialogs/:id (use existing endpoint)
    const baseUrl = this.client.getBaseUrl()
    const res = await fetch(`${baseUrl}/api/chat/dialogs/${this.dialogId}`, {
      credentials: 'include',
    })
    if (!res.ok) throw new Error(`Failed to get dialog info: ${res.status}`)
    const dialog = await res.json()
    return {
      name: dialog.name,
      icon: dialog.icon ?? null,
      description: dialog.description ?? null,
      prologue: dialog.prompt_config?.prologue ?? null,
    }
  }

  /**
   * Create a new session for the widget conversation.
   * @param name - Optional session name
   * @returns Created session object
   */
  async createSession(name?: string): Promise<WidgetSession> {
    if (this.client.mode === 'external') {
      // External: POST /api/chat/embed/:token/sessions
      return this.client.post<WidgetSession>('sessions', { name })
    }
    // Internal: POST /api/chat/conversations
    const baseUrl = this.client.getBaseUrl()
    const res = await fetch(`${baseUrl}/api/chat/conversations`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dialog_id: this.dialogId, name: name || 'Widget Session' }),
    })
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
    return res.json()
  }

  /**
   * Send a message and receive a streaming SSE response.
   * Returns the raw Response for the caller to consume as a ReadableStream.
   * @param content - User message text
   * @param sessionId - Session ID for conversation continuity
   * @returns Raw fetch Response with SSE body
   */
  async sendMessage(content: string, sessionId?: string): Promise<Response> {
    if (this.client.mode === 'external') {
      // External: POST /api/chat/embed/:token/completions
      return this.client.postStream('completions', {
        content,
        session_id: sessionId,
      })
    }
    // Internal: POST /api/chat/conversations/:id/completion
    const baseUrl = this.client.getBaseUrl()
    return fetch(`${baseUrl}/api/chat/conversations/${sessionId}/completion`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        content,
        dialog_id: this.dialogId,
      }),
    })
  }
}
