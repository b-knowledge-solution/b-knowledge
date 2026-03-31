/**
 * @fileoverview AgentRun model — CRUD for the agent_runs table.
 * @module modules/agents/models/agent-run
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description AgentRun interface representing a record in the 'agent_runs' table.
 *   Tracks individual execution instances of an agent workflow.
 */
export interface AgentRun {
  /** Unique UUID for the run */
  id: string
  /** UUID of the agent that was executed */
  agent_id: string
  /** Multi-tenant isolation identifier */
  tenant_id: string
  /** Execution lifecycle status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  /** Execution mode copied from agent at run start */
  mode: 'agent' | 'pipeline'
  /** User-provided input text/query */
  input: string | null
  /** Final output from the agent execution */
  output: string | null
  /** Error message if execution failed */
  error: string | null
  /** When execution started */
  started_at: Date | null
  /** When execution completed or failed */
  completed_at: Date | null
  /** Pre-computed duration in milliseconds for analytics */
  duration_ms: number | null
  /** Total number of nodes in the workflow */
  total_nodes: number
  /** Number of nodes that completed successfully */
  completed_nodes: number
  /** UUID of the user who triggered the run */
  triggered_by: string | null
  /** How the run was triggered */
  trigger_type: 'manual' | 'webhook' | 'embed'
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * @description Provides data access for the agent_runs table via BaseModel CRUD.
 *   Includes agent-scoped run listing for execution history.
 * @extends BaseModel<AgentRun>
 */
export class AgentRunModel extends BaseModel<AgentRun> {
  protected tableName = 'agent_runs'
  protected knex = db

  /**
   * @description Find all runs for a specific agent, ordered newest first.
   *   Used for execution history and debugging.
   * @param {string} agentId - UUID of the agent
   * @returns {Promise<AgentRun[]>} Array of runs for the agent
   */
  async findByAgent(agentId: string): Promise<AgentRun[]> {
    return this.knex(this.tableName)
      .where('agent_id', agentId)
      .orderBy('created_at', 'desc')
  }
}
