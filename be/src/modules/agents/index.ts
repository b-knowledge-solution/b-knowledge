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
