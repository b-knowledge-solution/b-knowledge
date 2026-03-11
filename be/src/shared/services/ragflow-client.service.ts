
/**
 * @fileoverview Singleton HTTP client for communicating with RAGFlow API.
 *
 * Provides typed helpers for GET, POST, and SSE streaming requests.
 * Reads RAGFlow base URL and API key from environment configuration.
 *
 * @module shared/services/ragflow-client
 */

import { log } from '@/shared/services/logger.service.js'

/** RAGFlow API base URL loaded from environment */
const RAGFLOW_API_BASE = process.env['RAGFLOW_API_BASE'] || 'http://localhost:9380'

/** RAGFlow API key loaded from environment */
const RAGFLOW_API_KEY = process.env['RAGFLOW_API_KEY'] || ''

/**
 * Build default headers for RAGFlow API requests.
 * @param extra - Additional headers to merge
 * @returns Headers object
 */
function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  }
  // Attach API key when configured
  if (RAGFLOW_API_KEY) {
    headers['Authorization'] = `Bearer ${RAGFLOW_API_KEY}`
  }
  return headers
}

/**
 * Singleton RAGFlow HTTP client.
 * Wraps fetch calls to the RAGFlow backend with auth and error handling.
 */
export class RagflowClient {
  /** Base URL for all RAGFlow requests */
  private baseUrl: string

  /**
   * @param baseUrl - RAGFlow API base URL
   */
  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || RAGFLOW_API_BASE).replace(/\/+$/, '')
  }

  /**
   * Perform a GET request to RAGFlow.
   * @param path - API path (e.g. '/api/conversation/list')
   * @param params - Query string parameters
   * @returns Parsed JSON response body
   */
  async get<T = any>(path: string, params?: Record<string, string>): Promise<T> {
    // Build URL with optional query params
    const url = new URL(path, this.baseUrl)
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v)
      }
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: buildHeaders(),
    })

    // Parse and return JSON body
    const body = await res.json() as T
    return body
  }

  /**
   * Perform a POST request to RAGFlow.
   * @param path - API path
   * @param data - Request body (will be JSON-serialized)
   * @returns Parsed JSON response body
   */
  async post<T = any>(path: string, data?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl)

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: buildHeaders(),
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })

    const body = await res.json() as T
    return body
  }

  /**
   * Perform a DELETE request to RAGFlow.
   * @param path - API path
   * @param data - Optional request body
   * @returns Parsed JSON response body
   */
  async delete<T = any>(path: string, data?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl)

    const res = await fetch(url.toString(), {
      method: 'DELETE',
      headers: buildHeaders(),
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })

    const body = await res.json() as T
    return body
  }

  /**
   * Perform a PUT request to RAGFlow.
   * @param path - API path
   * @param data - Request body
   * @returns Parsed JSON response body
   */
  async put<T = any>(path: string, data?: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl)

    const res = await fetch(url.toString(), {
      method: 'PUT',
      headers: buildHeaders(),
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })

    const body = await res.json() as T
    return body
  }

  /**
   * Open an SSE streaming connection to RAGFlow.
   * Returns the raw Response so the caller can read the body as a readable stream.
   * @param path - API path (e.g. '/api/conversation/completion')
   * @param data - POST body for the streaming request
   * @returns Raw fetch Response with readable body stream
   */
  async stream(path: string, data?: unknown): Promise<Response> {
    const url = new URL(path, this.baseUrl)

    // Use streaming-compatible headers
    const headers = buildHeaders({
      'Accept': 'text/event-stream',
    })

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers,
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })

    return res
  }
}

/** Singleton instance of the RAGFlow client */
export const ragflowClient = new RagflowClient()
