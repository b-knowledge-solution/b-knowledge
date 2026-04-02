/**
 * @fileoverview API layer for the embeddable agent widget.
 * All requests use the embed token in the URL path for authentication
 * (no session cookies required). Follows the chatWidgetApi pattern.
 *
 * @module features/agent-widget/api/agentWidgetApi
 */

/** @description Base API URL from Vite config */
const BASE = import.meta.env.VITE_API_BASE_URL || ''

/**
 * @description Agent widget API configuration returned by the config endpoint
 */
export interface AgentWidgetConfig {
  name: string
  avatar: string | null
  description: string | null
}

/**
 * @description Fetch agent configuration for widget header display.
 *   Uses the embed token in the URL path for public authentication.
 * @param {string} agentId - UUID of the agent
 * @param {string} token - Embed token for authentication
 * @returns {Promise<AgentWidgetConfig>} Agent name, avatar, and description
 * @throws {Error} If the token is invalid or the agent is not found
 */
export async function getConfig(agentId: string, token: string): Promise<AgentWidgetConfig> {
  const res = await fetch(`${BASE}/api/agents/embed/${token}/${agentId}/config`)

  // Handle auth and not-found errors
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as Record<string, string>).error || 'Failed to load agent config')
  }

  return res.json()
}

/**
 * @description Run an agent from the embed widget via SSE streaming.
 *   Opens a POST request and returns the raw Response for SSE consumption.
 * @param {string} agentId - UUID of the agent
 * @param {string} input - User input text
 * @param {string} token - Embed token for authentication
 * @returns {Promise<Response>} Fetch Response with SSE body stream
 * @throws {Error} If the request fails before streaming starts
 */
export async function runAgent(agentId: string, input: string, token: string): Promise<Response> {
  const res = await fetch(`${BASE}/api/agents/embed/${token}/${agentId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })

  // Handle pre-stream errors
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as Record<string, string>).error || 'Failed to run agent')
  }

  return res
}

/** @description Grouped widget API exports for convenient import */
export const agentWidgetApi = {
  getConfig,
  runAgent,
}
