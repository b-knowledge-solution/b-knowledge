/**
 * @fileoverview Widget authentication and API client utilities.
 * Provides dual-mode auth support for embeddable widgets:
 * - Internal mode: uses session cookies (same-origin)
 * - External mode: uses embed token (cross-origin)
 *
 * @module lib/widgetAuth
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for a widget API client.
 */
export interface WidgetApiConfig {
  /** Embed token for external (cross-origin) mode */
  token?: string | undefined
  /** Base URL of the B-Knowledge API (required for external mode) */
  baseUrl?: string | undefined
}

/**
 * Determines the auth mode based on config.
 */
export type WidgetAuthMode = 'internal' | 'external'

// ============================================================================
// Widget API Client Factory
// ============================================================================

/**
 * Create a widget API client for a given module (search or chat).
 * Handles dual-mode authentication transparently.
 *
 * @param module - The widget module ('search' or 'chat')
 * @param config - Widget configuration with optional token and baseUrl
 * @returns Object with fetch methods scoped to the widget module
 */
export function createWidgetApiClient(module: 'search' | 'chat', config: WidgetApiConfig) {
  const mode: WidgetAuthMode = config.token ? 'external' : 'internal'

  /**
   * Resolve the API base URL.
   * Internal mode: use empty string (relative URLs, proxied by Vite).
   * External mode: use the provided baseUrl.
   */
  const getBaseUrl = (): string => {
    if (mode === 'external') {
      return config.baseUrl || ''
    }
    // Internal mode: use VITE env if available, otherwise empty (relative)
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
      return import.meta.env.VITE_API_BASE_URL
    }
    return ''
  }

  /**
   * Build the full URL for an embed endpoint.
   * External mode routes through /api/<module>/embed/<token>/<path>
   * Internal mode routes through /api/<module>/apps/<appId>/<path>
   */
  const buildUrl = (path: string, appId?: string): string => {
    const base = getBaseUrl()
    if (mode === 'external') {
      return `${base}/api/${module}/embed/${config.token}/${path}`
    }
    return `${base}/api/${module}/apps/${appId}/${path}`
  }

  /**
   * Build request headers for the current auth mode.
   * External mode includes Bearer token for API key auth.
   */
  const buildHeaders = (): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    // Include Bearer token for external mode
    if (mode === 'external' && config.token) {
      headers['Authorization'] = `Bearer ${config.token}`
    }
    return headers
  }

  /**
   * Perform a GET request.
   * @param path - API path segment
   * @param appId - App ID (for internal mode)
   */
  const get = async <T>(path: string, appId?: string): Promise<T> => {
    const url = buildUrl(path, appId)
    const res = await fetch(url, {
      method: 'GET',
      credentials: mode === 'internal' ? 'include' : 'omit',
      headers: buildHeaders(),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `API error: ${res.status}`)
    }
    return res.json()
  }

  /**
   * Perform a POST request returning a raw Response (for SSE streaming).
   * @param path - API path segment
   * @param body - Request body
   * @param appId - App ID (for internal mode)
   */
  const postStream = async (path: string, body: unknown, appId?: string): Promise<Response> => {
    const url = buildUrl(path, appId)
    return fetch(url, {
      method: 'POST',
      credentials: mode === 'internal' ? 'include' : 'omit',
      headers: {
        ...buildHeaders(),
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
    })
  }

  /**
   * Perform a POST request returning parsed JSON.
   * @param path - API path segment
   * @param body - Request body
   * @param appId - App ID (for internal mode)
   */
  const post = async <T>(path: string, body: unknown, appId?: string): Promise<T> => {
    const url = buildUrl(path, appId)
    const res = await fetch(url, {
      method: 'POST',
      credentials: mode === 'internal' ? 'include' : 'omit',
      headers: buildHeaders(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `API error: ${res.status}`)
    }
    return res.json()
  }

  return { mode, get, post, postStream, getBaseUrl, buildUrl }
}
