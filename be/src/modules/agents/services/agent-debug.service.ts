/**
 * @fileoverview Agent debug service — step-by-step execution with breakpoints and Socket.IO events.
 *
 * Extends the execution engine with debug capabilities: pausing before each node,
 * stepping through one node at a time, setting breakpoints, and emitting real-time
 * debug events via Socket.IO. Debug state is ephemeral (in-memory maps), since
 * debug runs are interactive and short-lived.
 *
 * @module modules/agents/services/agent-debug
 */

import { v4 as uuidv4 } from 'uuid'
import { ModelFactory } from '@/shared/models/factory.js'
import { socketService } from '@/shared/services/socket.service.js'
import { log } from '@/shared/services/logger.service.js'
import type { AgentRunStep } from '../models/agent-run-step.model.js'
import type { AgentRun } from '../models/agent-run.model.js'
import { agentExecutorService } from './agent-executor.service.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @description Status values emitted in debug step events via Socket.IO
 */
type DebugStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

/**
 * @description Socket.IO event payload for agent:debug:step events
 */
interface DebugStepEvent {
  run_id: string
  node_id: string
  status: DebugStepStatus
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  duration_ms?: number
  error?: string
}

/**
 * @description In-memory debug run state tracking pending nodes, breakpoints, and current position
 */
interface DebugRunState {
  agentId: string
  tenantId: string
  userId: string
  /** Ordered list of node IDs in topological execution order */
  pendingNodes: string[]
  /** Set of node IDs where execution should pause */
  breakpoints: Set<string>
  /** Current index into pendingNodes (next node to execute) */
  currentIndex: number
  /** DSL node definitions keyed by node ID */
  nodeDefs: Record<string, { id: string; type: string; label: string; config: Record<string, unknown> }>
  /** Accumulated outputs from completed nodes */
  nodeOutputs: Map<string, Record<string, unknown>>
  /** User input for the run */
  input: string
  /** Whether the run is currently executing (prevents concurrent step/continue calls) */
  executing: boolean
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * @description Singleton service providing debug mode execution with step-by-step control,
 *   breakpoints, and Socket.IO events for real-time UI updates.
 */
class AgentDebugService {
  /** @description Map of active debug run IDs to their ephemeral state */
  private debugRuns = new Map<string, DebugRunState>()

  /**
   * @description Start a debug run: create DB record, compute execution order, and pause
   *   before the first node. Emits pending status for all nodes via Socket.IO.
   * @param {string} agentId - UUID of the agent to debug
   * @param {string} input - User-provided input text
   * @param {string} tenantId - Multi-tenant isolation identifier
   * @param {string} userId - UUID of the user triggering the debug run
   * @returns {Promise<string>} The created debug run UUID
   * @throws {Error} If agent not found, not owned by tenant, or DSL is invalid
   */
  async startDebugRun(
    agentId: string,
    input: string,
    tenantId: string,
    userId: string,
  ): Promise<string> {
    // Fetch agent and validate ownership
    const agent = await ModelFactory.agent.findById(agentId)
    if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 })
    if (agent.tenant_id !== tenantId) throw Object.assign(new Error('Agent not found'), { statusCode: 404 })

    // Parse the DSL graph
    const dsl = agent.dsl as any
    if (!dsl?.nodes || !dsl?.edges) {
      throw Object.assign(new Error('Agent DSL is empty or invalid'), { statusCode: 400 })
    }

    const runId = uuidv4()
    const nodeIds = Object.keys(dsl.nodes)
    const nodeCount = nodeIds.length

    // Create agent_run record with 'pending' status and manual trigger
    await ModelFactory.agentRun.create({
      id: runId,
      agent_id: agentId,
      tenant_id: tenantId,
      status: 'pending',
      mode: agent.mode,
      input,
      output: null,
      error: null,
      started_at: null,
      completed_at: null,
      duration_ms: null,
      total_nodes: nodeCount,
      completed_nodes: 0,
      triggered_by: userId,
      trigger_type: 'manual',
    } as AgentRun)

    // Compute topological execution order using the same Kahn's algorithm as executor
    const executionOrder = this.computeExecutionOrder(dsl.nodes, dsl.edges)

    // Initialize in-memory debug state
    const debugState: DebugRunState = {
      agentId,
      tenantId,
      userId,
      pendingNodes: executionOrder,
      breakpoints: new Set(),
      currentIndex: 0,
      nodeDefs: dsl.nodes,
      nodeOutputs: new Map(),
      input,
      executing: false,
    }
    this.debugRuns.set(runId, debugState)

    // Emit pending status for all nodes so the debug panel shows the full graph
    for (const nodeId of executionOrder) {
      this.emitDebugStep(userId, {
        run_id: runId,
        node_id: nodeId,
        status: 'pending',
      })
    }

    log.info('Debug run started', { runId, agentId, nodeCount: executionOrder.length })
    return runId
  }

  /**
   * @description Execute the next pending node in the debug run.
   *   Emits 'running' then 'completed'/'failed' status via Socket.IO.
   *   Pauses after execution (or at breakpoints during continueRun).
   * @param {string} runId - Debug run UUID
   * @param {string} userId - UUID of the requesting user
   * @returns {Promise<void>}
   * @throws {Error} If run not found, already completed, or concurrent execution
   */
  async stepNext(runId: string, userId: string): Promise<void> {
    const state = this.debugRuns.get(runId)
    if (!state) throw Object.assign(new Error('Debug run not found'), { statusCode: 404 })
    if (state.userId !== userId) throw Object.assign(new Error('Not authorized'), { statusCode: 403 })

    // Guard against concurrent step calls
    if (state.executing) {
      throw Object.assign(new Error('Step already executing'), { statusCode: 409 })
    }

    // Check if all nodes have been executed
    if (state.currentIndex >= state.pendingNodes.length) {
      throw Object.assign(new Error('All nodes have been executed'), { statusCode: 400 })
    }

    state.executing = true
    try {
      await this.executeNextNode(runId, state)
    } finally {
      state.executing = false
    }
  }

  /**
   * @description Continue executing all remaining nodes without pausing, except at breakpoints.
   *   Useful for "run to next breakpoint" behavior.
   * @param {string} runId - Debug run UUID
   * @param {string} userId - UUID of the requesting user
   * @returns {Promise<void>}
   * @throws {Error} If run not found or concurrent execution
   */
  async continueRun(runId: string, userId: string): Promise<void> {
    const state = this.debugRuns.get(runId)
    if (!state) throw Object.assign(new Error('Debug run not found'), { statusCode: 404 })
    if (state.userId !== userId) throw Object.assign(new Error('Not authorized'), { statusCode: 403 })

    // Guard against concurrent execution
    if (state.executing) {
      throw Object.assign(new Error('Already executing'), { statusCode: 409 })
    }

    state.executing = true
    try {
      // Execute nodes until completion or breakpoint
      while (state.currentIndex < state.pendingNodes.length) {
        const nextNodeId = state.pendingNodes[state.currentIndex]!

        // Stop at breakpoints (but execute the first step regardless)
        if (state.currentIndex > 0 && state.breakpoints.has(nextNodeId)) {
          log.info('Debug run paused at breakpoint', { runId, nodeId: nextNodeId })
          break
        }

        await this.executeNextNode(runId, state)
      }
    } finally {
      state.executing = false
    }
  }

  /**
   * @description Add a breakpoint on a node for this debug run.
   *   Execution will pause before this node during continueRun.
   * @param {string} runId - Debug run UUID
   * @param {string} nodeId - Node ID to add breakpoint on
   */
  setBreakpoint(runId: string, nodeId: string): void {
    const state = this.debugRuns.get(runId)
    if (!state) throw Object.assign(new Error('Debug run not found'), { statusCode: 404 })

    state.breakpoints.add(nodeId)
    log.debug('Breakpoint set', { runId, nodeId })
  }

  /**
   * @description Remove a breakpoint from a node for this debug run.
   * @param {string} runId - Debug run UUID
   * @param {string} nodeId - Node ID to remove breakpoint from
   */
  removeBreakpoint(runId: string, nodeId: string): void {
    const state = this.debugRuns.get(runId)
    if (!state) throw Object.assign(new Error('Debug run not found'), { statusCode: 404 })

    state.breakpoints.delete(nodeId)
    log.debug('Breakpoint removed', { runId, nodeId })
  }

  /**
   * @description Retrieve the step record with input/output data for a specific node.
   * @param {string} runId - Debug run UUID
   * @param {string} nodeId - Node ID to get details for
   * @returns {Promise<AgentRunStep>} The step record from the database
   * @throws {Error} If step not found
   */
  async getStepDetails(runId: string, nodeId: string): Promise<AgentRunStep> {
    // Query step record by run_id and node_id
    const steps = await ModelFactory.agentRunStep.findByRun(runId)
    const step = steps.find((s) => s.node_id === nodeId)
    if (!step) throw Object.assign(new Error('Step not found'), { statusCode: 404 })
    return step
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * @description Execute the node at state.currentIndex, update DB step records,
   *   and emit Socket.IO events for status transitions.
   * @param {string} runId - Debug run UUID
   * @param {DebugRunState} state - In-memory debug state
   * @returns {Promise<void>}
   */
  private async executeNextNode(runId: string, state: DebugRunState): Promise<void> {
    const nodeId = state.pendingNodes[state.currentIndex]!
    const nodeDef = state.nodeDefs[nodeId]

    // Skip if node definition not found (shouldn't happen with valid DSL)
    if (!nodeDef) {
      state.currentIndex++
      return
    }

    // Emit running status
    this.emitDebugStep(state.userId, {
      run_id: runId,
      node_id: nodeId,
      status: 'running',
    })

    // Create step record in DB
    const stepId = uuidv4()
    const stepStart = Date.now()
    await ModelFactory.agentRunStep.create({
      id: stepId,
      run_id: runId,
      node_id: nodeId,
      node_type: nodeDef.type,
      node_label: nodeDef.label || null,
      status: 'running',
      input_data: this.collectNodeInput(nodeId, state),
      output_data: null,
      error: null,
      started_at: new Date(),
      completed_at: null,
      duration_ms: null,
      execution_order: state.currentIndex,
    } as AgentRunStep)

    try {
      // Execute the node inline (debug mode uses simplified inline execution)
      const inputData = this.collectNodeInput(nodeId, state)
      const result = this.executeInlineNode(nodeDef, inputData, state.input)
      const durationMs = Date.now() - stepStart

      // Update step record as completed
      await ModelFactory.agentRunStep.update(stepId, {
        status: 'completed',
        output_data: result,
        completed_at: new Date(),
        duration_ms: durationMs,
      } as Partial<AgentRunStep>)

      // Store output for downstream nodes
      state.nodeOutputs.set(nodeId, result)

      // Emit completed status with input/output data
      this.emitDebugStep(state.userId, {
        run_id: runId,
        node_id: nodeId,
        status: 'completed',
        input: inputData,
        output: result,
        duration_ms: durationMs,
      })

      // Update run progress
      await ModelFactory.agentRun.update(runId, {
        completed_nodes: state.currentIndex + 1,
        status: 'running',
        ...(!state.currentIndex ? { started_at: new Date() } : {}),
      } as Partial<AgentRun>)
    } catch (err) {
      const durationMs = Date.now() - stepStart
      const errorMsg = String(err)

      // Update step as failed
      await ModelFactory.agentRunStep.update(stepId, {
        status: 'failed',
        error: errorMsg,
        completed_at: new Date(),
        duration_ms: durationMs,
      } as Partial<AgentRunStep>)

      // Emit failed status with error
      this.emitDebugStep(state.userId, {
        run_id: runId,
        node_id: nodeId,
        status: 'failed',
        error: errorMsg,
        duration_ms: durationMs,
      })

      log.error('Debug step failed', { runId, nodeId, error: errorMsg })
    }

    // Advance to next node
    state.currentIndex++

    // If all nodes executed, mark run as completed and clean up
    if (state.currentIndex >= state.pendingNodes.length) {
      await ModelFactory.agentRun.update(runId, {
        status: 'completed',
        completed_at: new Date(),
      } as Partial<AgentRun>)
      this.debugRuns.delete(runId)
      log.info('Debug run completed', { runId })
    }
  }

  /**
   * @description Collect input data for a node from upstream node outputs.
   * @param {string} nodeId - Target node ID
   * @param {DebugRunState} state - Debug run state with node outputs
   * @returns {Record<string, unknown>} Aggregated input data
   */
  private collectNodeInput(
    nodeId: string,
    state: DebugRunState,
  ): Record<string, unknown> {
    const nodeDef = state.nodeDefs[nodeId]

    // Begin node receives user input directly
    if (nodeDef?.type === 'begin') {
      return { input: state.input }
    }

    // Collect outputs from previously completed upstream nodes
    const input: Record<string, unknown> = {}
    for (const [completedId, output] of state.nodeOutputs.entries()) {
      input[completedId] = output.output
    }

    // If only one upstream output, flatten
    if (state.nodeOutputs.size === 1) {
      const [, singleOutput] = [...state.nodeOutputs.entries()][0]!
      return { ...singleOutput }
    }

    return input
  }

  /**
   * @description Execute a node inline for debug mode. Handles all lightweight node types.
   *   Debug mode executes all nodes inline (Python dispatch is skipped for debugging).
   * @param {{ id: string; type: string; label: string; config: Record<string, unknown> }} nodeDef - Node definition
   * @param {Record<string, unknown>} inputData - Collected input from upstream
   * @param {string} userInput - Original user input
   * @returns {Record<string, unknown>} Node execution result
   */
  private executeInlineNode(
    nodeDef: { type: string; config: Record<string, unknown> },
    inputData: Record<string, unknown>,
    userInput: string,
  ): Record<string, unknown> {
    switch (nodeDef.type) {
      case 'begin':
        return { output: userInput }

      case 'answer':
        return { output: inputData.content || inputData.output || '' }

      case 'message':
        return { output: (nodeDef.config?.content as string) || '' }

      case 'switch': {
        // Evaluate switch conditions
        const conditions = (nodeDef.config?.conditions || []) as Array<{ value: string; operator: string; target: string }>
        const inputValue = String(inputData.output || '')
        const matched = conditions.find((c) => {
          if (c.operator === 'contains') return inputValue.includes(c.value)
          if (c.operator === 'equals') return inputValue === c.value
          return false
        })
        return { output: inputValue, matched_branch: matched?.target || 'default' }
      }

      case 'condition': {
        const expr = (nodeDef.config?.expression as string) || 'true'
        const result = expr === 'true' || inputData.output === expr
        return { output: inputData.output || '', condition_result: result }
      }

      case 'merge':
      case 'concentrator':
        return { output: inputData.output || '', merged: true }

      case 'template': {
        let templateStr = (nodeDef.config?.template as string) || ''
        for (const [key, value] of Object.entries(inputData)) {
          templateStr = templateStr.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
        }
        return { output: templateStr }
      }

      case 'note':
        return { output: '' }

      case 'keyword_extract':
        return { output: inputData.output || '', keywords: [] }

      default:
        // For Python-dispatched nodes in debug mode, return a placeholder
        return { output: `[debug] ${nodeDef.type} node — execution simulated`, simulated: true }
    }
  }

  /**
   * @description Compute topological execution order using Kahn's algorithm.
   *   Ignores loop-back edges to avoid cycle detection on loop nodes.
   * @param {Record<string, { id: string; type: string }>} nodes - DSL node map
   * @param {Array<{ source: string; target: string; sourceHandle?: string }>} edges - DSL edges
   * @returns {string[]} Node IDs in topological execution order
   */
  private computeExecutionOrder(
    nodes: Record<string, { id: string; type: string }>,
    edges: Array<{ source: string; target: string; sourceHandle?: string }>,
  ): string[] {
    const nodeIds = Object.keys(nodes)
    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()

    // Initialize
    for (const id of nodeIds) {
      inDegree.set(id, 0)
      adjList.set(id, [])
    }

    // Build adjacency list, skipping loop-back edges
    for (const edge of edges) {
      const targetNode = nodes[edge.target]
      if (targetNode?.type === 'loop' && edge.sourceHandle === 'loop_back') continue

      adjList.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    // Kahn's algorithm
    const queue: string[] = []
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id)
    }

    const sorted: string[] = []
    while (queue.length > 0) {
      const current = queue.shift()!
      sorted.push(current)

      for (const neighbor of adjList.get(current) || []) {
        const newDeg = (inDegree.get(neighbor) || 1) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) queue.push(neighbor)
      }
    }

    return sorted
  }

  /**
   * @description Emit a debug step event to the user via Socket.IO.
   * @param {string} userId - Target user ID
   * @param {DebugStepEvent} event - Step event payload
   */
  private emitDebugStep(userId: string, event: DebugStepEvent): void {
    socketService.emitToUser(userId, 'agent:debug:step', event)
  }
}

/** @description Singleton instance of the agent debug service */
export const agentDebugService = new AgentDebugService()
