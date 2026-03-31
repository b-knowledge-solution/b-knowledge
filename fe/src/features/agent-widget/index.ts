/**
 * @fileoverview Barrel export for the agent-widget feature module.
 * @module features/agent-widget
 */

/** @description Embeddable agent chat widget component */
export { AgentWidgetButton } from './components/AgentWidgetButton'

/** @description Agent widget API functions */
export { agentWidgetApi, getConfig, runAgent } from './api/agentWidgetApi'
export type { AgentWidgetConfig } from './api/agentWidgetApi'
