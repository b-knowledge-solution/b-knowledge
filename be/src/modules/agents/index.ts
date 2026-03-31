/**
 * @fileoverview Barrel export for the Agents module.
 * @description Public API surface for the agents module. External modules should
 *   import only from this file, never from internal paths.
 * @module modules/agents
 */

/** @description Agent routes for Express router registration */
export { default as agentRoutes } from './routes/agent.routes.js'

/** @description Core agent service singleton for CRUD and versioning operations */
export { agentService } from './services/agent.service.js'

/** @description Agent execution engine for run lifecycle management */
export { agentExecutorService } from './services/agent-executor.service.js'

/** @description Redis Streams dispatch service for Python worker communication */
export { agentRedisService } from './services/agent-redis.service.js'

/** @description Debug mode service for step-by-step execution with breakpoints */
export { agentDebugService } from './services/agent-debug.service.js'

/** @description MCP client integration for standardized tool calling */
export { agentMcpService } from './services/agent-mcp.service.js'

/** @description Docker sandbox for safe code execution in ephemeral containers */
export { agentSandboxService } from './services/agent-sandbox.service.js'

/** @description Encrypted tool credential management */
export { agentToolCredentialService } from './services/agent-tool-credential.service.js'

/** @description Agent embed widget service for token management and SSE streaming */
export { agentEmbedService } from './services/agent-embed.service.js'

/** @description Agent embed widget routes for public token-based access */
export { default as agentEmbedRoutes } from './routes/agent-embed.routes.js'
