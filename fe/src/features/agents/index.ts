/**
 * @fileoverview Barrel export for the agents feature module.
 *
 * Public API for the agent feature — all external imports should go through this file.
 * Never import directly from internal files.
 *
 * @module features/agents
 */

// Types
export type {
  Agent,
  AgentDSL,
  AgentEdgeDef,
  AgentMode,
  AgentNodeDef,
  AgentRun,
  AgentRunStatus,
  AgentRunStep,
  AgentStatus,
  AgentStepStatus,
  AgentTemplate,
  AgentToolCredential,
  AgentTriggerType,
  AgentVariable,
  CreateAgentDto,
  NodeCategory,
  OperatorType,
  UpdateAgentDto,
} from './types/agent.types'

// Constants
export { NODE_CATEGORY_COLORS, NODE_CATEGORY_MAP } from './types/agent.types'

// Store
export { useCanvasStore } from './store/canvasStore'
