/**
 * @fileoverview MCP (Model Context Protocol) client integration service.
 *
 * Manages connections to MCP servers for standardized tool calling. Maintains
 * a connection pool keyed by server URL so repeated calls reuse existing clients.
 *
 * @module modules/agents/services/agent-mcp
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { logger } from '@/shared/services/logger.service.js'

/** @description Default timeout for MCP tool calls in milliseconds */
const DEFAULT_TOOL_TIMEOUT_MS = 30_000

/** @description Tool definition returned by an MCP server */
export interface McpTool {
  /** Tool name identifier */
  name: string
  /** Human-readable description of the tool */
  description: string | undefined
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown> | undefined
}

/**
 * @description Singleton service managing MCP server connections.
 *   Provides connect, listTools, callTool, and disconnect lifecycle.
 *   Caches clients by server URL to avoid repeated handshakes.
 */
class AgentMcpService {
  /** Connection pool: server URL -> active MCP client */
  private clients = new Map<string, Client>()

  /**
   * @description Connect to an MCP server and cache the client for reuse.
   *   If a client for this URL already exists, returns it directly.
   * @param {string} serverUrl - HTTP(S) URL of the MCP server
   * @returns {Promise<Client>} Connected MCP client instance
   * @throws {Error} If connection fails (network, auth, incompatible server)
   */
  async connect(serverUrl: string): Promise<Client> {
    // Return cached client if connection already exists
    const existing = this.clients.get(serverUrl)
    if (existing) return existing

    try {
      // Create transport using HTTP streaming protocol
      const transport = new StreamableHTTPClientTransport(new URL(serverUrl))

      // Initialize MCP client with identifying metadata
      const client = new Client({
        name: 'b-knowledge-agent',
        version: '1.0.0',
      })

      // Establish connection to the MCP server (cast needed for exactOptionalPropertyTypes)
      await client.connect(transport as Parameters<typeof client.connect>[0])

      // Cache the connected client for subsequent calls
      this.clients.set(serverUrl, client)
      logger.info(`MCP client connected to ${serverUrl}`)

      return client
    } catch (error) {
      logger.error(`MCP connection failed for ${serverUrl}: ${String(error)}`)
      throw error
    }
  }

  /**
   * @description List available tools from an MCP server.
   *   Connects if not already connected.
   * @param {string} serverUrl - HTTP(S) URL of the MCP server
   * @returns {Promise<McpTool[]>} Array of tool definitions from the server
   */
  async listTools(serverUrl: string): Promise<McpTool[]> {
    const client = await this.connect(serverUrl)

    try {
      const result = await client.listTools()
      return (result.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
      }))
    } catch (error) {
      logger.error(`MCP listTools failed for ${serverUrl}: ${String(error)}`)
      throw error
    }
  }

  /**
   * @description Call a tool on an MCP server with the given arguments.
   *   Connects if not already connected. Enforces a timeout to prevent hanging.
   * @param {string} serverUrl - HTTP(S) URL of the MCP server
   * @param {string} toolName - Name of the tool to invoke
   * @param {Record<string, unknown>} args - Arguments to pass to the tool
   * @param {number} [timeoutMs] - Timeout in milliseconds (default 30s)
   * @returns {Promise<unknown>} Tool execution result
   * @throws {Error} If the call fails or times out
   */
  async callTool(
    serverUrl: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number = DEFAULT_TOOL_TIMEOUT_MS,
  ): Promise<unknown> {
    const client = await this.connect(serverUrl)

    try {
      // Race the tool call against a timeout to prevent indefinite hangs
      const result = await Promise.race([
        client.callTool({ name: toolName, arguments: args }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`MCP callTool timed out after ${timeoutMs}ms`)), timeoutMs),
        ),
      ])

      return result
    } catch (error) {
      logger.error(`MCP callTool failed: server=${serverUrl}, tool=${toolName}, error=${String(error)}`)
      throw error
    }
  }

  /**
   * @description Disconnect from a specific MCP server and remove from pool.
   * @param {string} serverUrl - HTTP(S) URL of the MCP server to disconnect
   */
  async disconnect(serverUrl: string): Promise<void> {
    const client = this.clients.get(serverUrl)
    if (!client) return

    try {
      await client.close()
    } catch (error) {
      // Log but don't throw — cleanup should be best-effort
      logger.warn(`MCP disconnect error for ${serverUrl}: ${String(error)}`)
    } finally {
      this.clients.delete(serverUrl)
    }
  }

  /**
   * @description Disconnect all MCP server connections for graceful shutdown.
   */
  async disconnectAll(): Promise<void> {
    const urls = Array.from(this.clients.keys())
    await Promise.allSettled(urls.map((url) => this.disconnect(url)))
    logger.info(`MCP: disconnected all ${urls.length} clients`)
  }
}

/** @description Singleton MCP service instance */
export const agentMcpService = new AgentMcpService()
