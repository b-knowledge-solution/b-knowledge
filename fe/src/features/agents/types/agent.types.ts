/**
 * @fileoverview Agent domain types defining the complete DSL schema, entity interfaces,
 * operator types, and node category mappings for the agent canvas feature.
 *
 * These are the canonical type contracts for the entire agent feature.
 * All 23+ operator types, DSL node/edge definitions, run tracking, and
 * template types are defined here.
 *
 * @module features/agents/types/agent.types
 */

// ============================================================================
// Enum-like Union Types
// ============================================================================

/** @description Agent execution mode: free-form agent or fixed pipeline */
export type AgentMode = 'agent' | 'pipeline'

/** @description Agent lifecycle status */
export type AgentStatus = 'draft' | 'published'

/** @description Run execution status */
export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** @description How the run was triggered */
export type AgentTriggerType = 'manual' | 'webhook' | 'embed'

/** @description Individual step execution status */
export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

/** @description Node category for UI color coding per UI-SPEC */
export type NodeCategory = 'input-output' | 'llm-ai' | 'retrieval' | 'logic-flow' | 'code-tool' | 'data'

/**
 * @description All supported operator types for agent canvas nodes.
 * Categories: input-output, llm-ai, retrieval, logic-flow, code-tool, data
 */
export type OperatorType =
  | 'begin' | 'answer' | 'message'                    // input-output
  | 'generate' | 'categorize' | 'rewrite' | 'relevant' // llm-ai
  | 'retrieval' | 'wikipedia' | 'tavily' | 'pubmed'    // retrieval
  | 'switch' | 'condition' | 'loop' | 'merge' | 'note' // logic-flow
  | 'code' | 'github' | 'sql' | 'api' | 'email'       // code-tool
  | 'template' | 'keyword_extract' | 'baidu' | 'bing' | 'duckduckgo' | 'google' // data
  | 'google_scholar' | 'arxiv' | 'deepl' | 'qweather' | 'exesql' | 'crawler'
  | 'invoke' | 'concentrator' | 'akshare' | 'yahoofinance' | 'jin10' | 'tushare'
  | 'wencai'

// ============================================================================
// DSL Schema Types (stored as JSONB)
// ============================================================================

/**
 * @description DSL node definition representing a single operator on the canvas
 */
export interface AgentNodeDef {
  id: string
  type: OperatorType
  position: { x: number; y: number }
  config: Record<string, unknown>
  label: string
}

/**
 * @description DSL edge definition representing a connection between two nodes
 */
export interface AgentEdgeDef {
  source: string
  target: string
  sourceHandle?: string
  condition?: string
}

/**
 * @description Agent variable definition for parameterized workflows
 */
export interface AgentVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'json'
  default_value?: string
}

/**
 * @description Root DSL schema stored as JSONB on the agent record.
 * Contains the complete graph definition, variables, and execution settings.
 */
export interface AgentDSL {
  nodes: Record<string, AgentNodeDef>
  edges: AgentEdgeDef[]
  variables: Record<string, AgentVariable>
  settings: {
    mode: AgentMode
    max_execution_time: number
    retry_on_failure: boolean
  }
}

// ============================================================================
// Entity Interfaces
// ============================================================================

/**
 * @description Main Agent entity matching the agents database table schema
 */
export interface Agent {
  id: string
  name: string
  description: string | null
  avatar: string | null
  mode: AgentMode
  status: AgentStatus
  dsl: AgentDSL
  dsl_version: number
  policy_rules: Record<string, unknown> | null
  tenant_id: string
  project_id: string | null
  parent_id: string | null
  version_number: number
  version_label: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * @description Agent run record tracking a single execution of an agent
 */
export interface AgentRun {
  id: string
  agent_id: string
  tenant_id: string
  status: AgentRunStatus
  mode: AgentMode
  input: string | null
  output: string | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  total_nodes: number
  completed_nodes: number
  triggered_by: string | null
  trigger_type: AgentTriggerType
  created_at: string
  updated_at: string
}

/**
 * @description Individual step within an agent run, tracking per-node execution
 */
export interface AgentRunStep {
  id: string
  run_id: string
  node_id: string
  node_type: OperatorType
  node_label: string | null
  status: AgentStepStatus
  input_data: Record<string, unknown> | null
  output_data: Record<string, unknown> | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  duration_ms: number | null
  execution_order: number
  created_at: string
}

/**
 * @description Pre-built agent template for quick-start workflows
 */
export interface AgentTemplate {
  id: string
  name: string
  description: string | null
  avatar: string | null
  category: string | null
  mode: AgentMode
  dsl: AgentDSL
  dsl_version: number
  is_system: boolean
  tenant_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * @description Tool credential reference (without encrypted value for frontend safety)
 */
export interface AgentToolCredential {
  id: string
  tenant_id: string
  agent_id: string | null
  tool_type: string
  name: string
  created_by: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// API Request/Response DTOs
// ============================================================================

/**
 * @description DTO for creating a new agent
 */
export interface CreateAgentDto {
  name: string
  description?: string
  mode: AgentMode
  project_id?: string
  template_id?: string
}

/**
 * @description DTO for updating an existing agent
 */
export interface UpdateAgentDto {
  name?: string
  description?: string
  dsl?: AgentDSL
  status?: AgentStatus
}

// ============================================================================
// Node Category Mappings (UI)
// ============================================================================

/**
 * @description Maps each operator type to its UI category for color coding and grouping.
 * Used by the node palette and canvas renderer per UI-SPEC.
 */
export const NODE_CATEGORY_MAP: Record<OperatorType, NodeCategory> = {
  // input-output
  begin: 'input-output', answer: 'input-output', message: 'input-output',
  // llm-ai
  generate: 'llm-ai', categorize: 'llm-ai', rewrite: 'llm-ai', relevant: 'llm-ai',
  // retrieval
  retrieval: 'retrieval', wikipedia: 'retrieval', tavily: 'retrieval', pubmed: 'retrieval',
  // logic-flow
  switch: 'logic-flow', condition: 'logic-flow', loop: 'logic-flow', merge: 'logic-flow', note: 'logic-flow',
  concentrator: 'logic-flow',
  // code-tool
  code: 'code-tool', github: 'code-tool', sql: 'code-tool', api: 'code-tool', email: 'code-tool',
  invoke: 'code-tool',
  // data
  template: 'data', keyword_extract: 'data', baidu: 'data', bing: 'data', duckduckgo: 'data', google: 'data',
  google_scholar: 'data', arxiv: 'data', deepl: 'data', qweather: 'data', exesql: 'data', crawler: 'data',
  akshare: 'data', yahoofinance: 'data', jin10: 'data', tushare: 'data', wencai: 'data',
} as const

/**
 * @description Color palette for each node category, supporting light and dark themes.
 * Colors are hex values used by the canvas renderer.
 */
export const NODE_CATEGORY_COLORS: Record<NodeCategory, { light: string; dark: string }> = {
  'input-output': { light: '#3b82f6', dark: '#60a5fa' },
  'llm-ai': { light: '#8b5cf6', dark: '#a78bfa' },
  'retrieval': { light: '#10b981', dark: '#34d399' },
  'logic-flow': { light: '#f59e0b', dark: '#fbbf24' },
  'code-tool': { light: '#ec4899', dark: '#f472b6' },
  'data': { light: '#06b6d4', dark: '#22d3ee' },
} as const
