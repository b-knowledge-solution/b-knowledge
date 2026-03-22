/**
 * @fileoverview AgentRunStep model — CRUD for the agent_run_steps table.
 * @module modules/agents/models/agent-run-step
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'

/**
 * @description AgentRunStep interface representing a record in the 'agent_run_steps' table.
 *   Tracks per-node execution details within an agent run for debugging and observability.
 */
export interface AgentRunStep {
  /** Unique UUID for the step */
  id: string
  /** UUID of the parent run */
  run_id: string
  /** Node identifier from the DSL graph */
  node_id: string
  /** Node type for dispatch (e.g., 'llm', 'retrieval', 'code') */
  node_type: string
  /** Human-readable node label from canvas */
  node_label: string | null
  /** Step execution status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  /** Input data passed to the node */
  input_data: Record<string, unknown> | null
  /** Output data produced by the node */
  output_data: Record<string, unknown> | null
  /** Error message if step failed */
  error: string | null
  /** When step execution started */
  started_at: Date | null
  /** When step execution completed */
  completed_at: Date | null
  /** Step duration in milliseconds */
  duration_ms: number | null
  /** Execution order for sequential replay */
  execution_order: number
  /** Timestamp of record creation */
  created_at: Date
}

/**
 * @description Provides data access for the agent_run_steps table via BaseModel CRUD.
 *   Includes run-scoped step listing for execution debugging.
 * @extends BaseModel<AgentRunStep>
 */
export class AgentRunStepModel extends BaseModel<AgentRunStep> {
  protected tableName = 'agent_run_steps'
  protected knex = db

  /**
   * @description Find all steps for a specific run, ordered by execution order.
   *   Used for step-by-step debugging and replay in the debug panel.
   * @param {string} runId - UUID of the parent run
   * @returns {Promise<AgentRunStep[]>} Array of steps ordered by execution_order
   */
  async findByRun(runId: string): Promise<AgentRunStep[]> {
    return this.knex(this.tableName)
      .where('run_id', runId)
      .orderBy('execution_order', 'asc')
  }
}
