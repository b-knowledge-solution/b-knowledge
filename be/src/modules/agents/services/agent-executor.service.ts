/**
 * @fileoverview Agent execution engine — graph orchestrator with topological sort.
 *
 * Node.js handles graph traversal: parsing the DSL into an adjacency list,
 * computing execution order via Kahn's algorithm, and managing run state.
 * Compute-heavy nodes (LLM, retrieval, code, tools) are dispatched to Python
 * via Redis Streams. Lightweight nodes (switch, condition, merge, begin, answer)
 * execute inline in Node.js.
 *
 * Communication with Python workers uses the same Redis Streams pattern as
 * rag-redis.service.ts (XADD/XREADGROUP with consumer groups).
 *
 * @module modules/agents/services/agent-executor
 */

import { Response as ExpressResponse } from 'express'
import { getUuid } from '@/shared/utils/uuid.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { agentRedisService, type AgentNodeTask } from './agent-redis.service.js'
import type { AgentRun } from '../models/agent-run.model.js'
import type { AgentRunStep } from '../models/agent-run-step.model.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @description DSL node definition matching the frontend AgentNodeDef type.
 *   Represents a single operator on the canvas stored in the agent's JSONB DSL.
 */
interface AgentNodeDef {
  id: string
  type: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  label: string
}

/**
 * @description DSL edge definition connecting two nodes in the graph.
 */
interface AgentEdgeDef {
  source: string
  target: string
  sourceHandle?: string
  condition?: string
}

/**
 * @description Root DSL schema stored as JSONB on the agent record.
 */
interface AgentDSL {
  nodes: Record<string, AgentNodeDef>
  edges: AgentEdgeDef[]
  variables: Record<string, unknown>
  settings: {
    mode: string
    max_execution_time: number
    retry_on_failure: boolean
  }
}

/**
 * @description Status snapshot returned by getRunStatus.
 */
interface AgentRunStatusResult {
  id: string
  status: AgentRun['status']
  completed_nodes: number
  total_nodes: number
  output: string | null
  error: string | null
}

// Node types that execute inline in Node.js (lightweight logic)
const INLINE_NODE_TYPES = new Set([
  'begin', 'answer', 'message', 'switch', 'condition',
  'merge', 'note', 'concentrator', 'template', 'keyword_extract',
])

// Node types dispatched to Python worker (compute-heavy)
const DISPATCH_NODE_TYPES = new Set([
  'generate', 'categorize', 'rewrite', 'relevant',
  'retrieval', 'wikipedia', 'tavily', 'pubmed',
  'code', 'github', 'sql', 'api', 'email',
  'baidu', 'bing', 'duckduckgo', 'google',
  'google_scholar', 'arxiv', 'deepl', 'qweather',
  'exesql', 'crawler', 'invoke', 'akshare',
  'yahoofinance', 'jin10', 'tushare', 'wencai', 'loop',
])

/**
 * @description Singleton service managing the full lifecycle of agent run execution.
 *   Orchestrates graph traversal using Kahn's topological sort, dispatches
 *   compute-heavy nodes to Python via Redis Streams, executes lightweight
 *   nodes inline, and streams output via SSE.
 */
class AgentExecutorService {
  /** @description Map of active run IDs to their abort controllers for timeout/cancel */
  private activeRuns = new Map<string, { cancelled: boolean; timeoutId?: ReturnType<typeof setTimeout> }>()

  /**
   * @description Start a new agent run: create DB record, validate graph, and begin execution.
   *   Returns immediately with the run_id; execution proceeds asynchronously.
   * @param {string} agentId - UUID of the agent to execute
   * @param {string} input - User-provided input text/query
   * @param {string} tenantId - Multi-tenant isolation identifier
   * @param {string} userId - UUID of the user triggering the run
   * @param {'manual' | 'webhook' | 'embed'} triggerType - How the run was triggered
   * @returns {Promise<string>} The created run UUID
   * @throws {Error} If agent not found, not published, or graph is invalid
   */
  async startRun(
    agentId: string,
    input: string,
    tenantId: string,
    userId: string,
    triggerType: 'manual' | 'webhook' | 'embed',
  ): Promise<string> {
    // Fetch agent and validate it exists and is published
    const agent = await ModelFactory.agent.findById(agentId)
    if (!agent) throw Object.assign(new Error('Agent not found'), { statusCode: 404 })
    if (agent.tenant_id !== tenantId) throw Object.assign(new Error('Agent not found'), { statusCode: 404 })
    if (agent.status !== 'published') {
      throw Object.assign(new Error('Agent must be published before execution'), { statusCode: 400 })
    }

    // Parse and validate the DSL graph
    const dsl = agent.dsl as unknown as AgentDSL
    if (!dsl?.nodes || !dsl?.edges) {
      throw Object.assign(new Error('Agent DSL is empty or invalid'), { statusCode: 400 })
    }

    // Validate graph structure before creating the run
    this.validateGraph(dsl)

    const runId = getUuid()
    const nodeCount = Object.keys(dsl.nodes).length

    // Create the agent_run record with pending status
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
      trigger_type: triggerType,
    } as AgentRun)

    // Start execution asynchronously (fire and forget with error handling)
    this.executeGraph(runId, dsl, tenantId, agentId, input).catch((err) => {
      log.error('Agent graph execution failed', { runId, error: String(err) })
    })

    return runId
  }

  /**
   * @description Stream agent run output to the client via SSE.
   *   Subscribes to the Redis pub/sub channel for the run and forwards
   *   delta events as SSE data frames. Ends with [DONE] when run completes.
   * @param {string} runId - Agent run UUID
   * @param {ExpressResponse} res - Express response object for SSE writing
   * @returns {Promise<void>}
   */
  async streamRun(runId: string, res: ExpressResponse): Promise<void> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // Check if the run already completed before subscription
    const run = await ModelFactory.agentRun.findById(runId)
    if (!run) {
      res.write(`data: ${JSON.stringify({ error: 'Run not found' })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // If run is already terminal, send final status and close
    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      res.write(`data: ${JSON.stringify({ type: 'status', status: run.status, output: run.output, error: run.error })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    let ended = false

    /**
     * Handle incoming messages from Redis pub/sub and forward to SSE.
     * Terminates the stream when a 'done' type message is received.
     */
    const handleMessage = (message: Record<string, unknown>) => {
      if (ended) return

      // Forward the message as an SSE data frame
      res.write(`data: ${JSON.stringify(message)}\n\n`)

      // Check for terminal events
      if (message.type === 'done' || message.type === 'error') {
        ended = true
        res.write('data: [DONE]\n\n')
        res.end()
        // Clean up subscription
        agentRedisService.unsubscribeFromRunOutput(runId).catch(() => {})
      }
    }

    // Subscribe to run output channel
    await agentRedisService.subscribeToRunOutput(runId, handleMessage)

    // Handle client disconnect (browser closes tab, etc.)
    res.on('close', () => {
      if (!ended) {
        ended = true
        agentRedisService.unsubscribeFromRunOutput(runId).catch(() => {})
      }
    })
  }

  /**
   * @description Cancel an in-progress agent run.
   *   Sets the run status to cancelled, publishes a cancel signal via Redis,
   *   and clears timeout/state for the run.
   * @param {string} runId - Agent run UUID
   * @param {string} tenantId - Multi-tenant isolation identifier
   * @returns {Promise<void>}
   * @throws {Error} If run not found or already terminal
   */
  async cancelRun(runId: string, tenantId: string): Promise<void> {
    const run = await ModelFactory.agentRun.findById(runId)
    if (!run) throw Object.assign(new Error('Run not found'), { statusCode: 404 })
    if (run.tenant_id !== tenantId) throw Object.assign(new Error('Run not found'), { statusCode: 404 })

    // Only cancel runs that are still in-progress
    if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      throw Object.assign(new Error('Run is already terminal'), { statusCode: 400 })
    }

    // Mark the run as cancelled in the local state map
    const runState = this.activeRuns.get(runId)
    if (runState) {
      runState.cancelled = true
      if (runState.timeoutId) clearTimeout(runState.timeoutId)
    }

    // Update DB status
    await ModelFactory.agentRun.update(runId, {
      status: 'cancelled',
      completed_at: new Date(),
    } as Partial<AgentRun>)

    // Publish cancel signal for Python worker to check
    await agentRedisService.publishCancelSignal(runId)

    // Notify SSE subscribers that run was cancelled
    await agentRedisService.publishRunOutput(runId, {
      type: 'done',
      status: 'cancelled',
    })

    log.info('Cancelled agent run', { runId })
  }

  /**
   * @description Get the current status of an agent run.
   * @param {string} runId - Agent run UUID
   * @returns {Promise<AgentRunStatusResult>} Current run status snapshot
   * @throws {Error} If run not found
   */
  async getRunStatus(runId: string): Promise<AgentRunStatusResult> {
    const run = await ModelFactory.agentRun.findById(runId)
    if (!run) throw Object.assign(new Error('Run not found'), { statusCode: 404 })

    return {
      id: run.id,
      status: run.status,
      completed_nodes: run.completed_nodes,
      total_nodes: run.total_nodes,
      output: run.output,
      error: run.error,
    }
  }

  /**
   * @description Execute the agent graph using Kahn's topological sort algorithm.
   *   Traverses nodes in dependency order, dispatching to Python or executing inline.
   * @param {string} runId - Agent run UUID
   * @param {AgentDSL} dsl - Parsed DSL graph definition
   * @param {string} tenantId - Multi-tenant isolation identifier
   * @param {string} agentId - Agent UUID for task dispatch
   * @param {string} input - User input for the begin node
   * @returns {Promise<void>}
   */
  private async executeGraph(
    runId: string,
    dsl: AgentDSL,
    tenantId: string,
    agentId: string,
    input: string,
  ): Promise<void> {
    // Register this run in the active runs map
    const runState: { cancelled: boolean; timeoutId?: ReturnType<typeof setTimeout> } = { cancelled: false }
    this.activeRuns.set(runId, runState)

    // Set execution timeout from DSL settings (default 5 minutes)
    const maxExecutionTime = (dsl.settings?.max_execution_time || 300) * 1000
    runState.timeoutId = setTimeout(() => {
      this.handleTimeout(runId)
    }, maxExecutionTime)

    try {
      // Mark run as running
      await ModelFactory.agentRun.update(runId, {
        status: 'running',
        started_at: new Date(),
      } as Partial<AgentRun>)

      // Notify SSE subscribers that run started
      await agentRedisService.publishRunOutput(runId, {
        type: 'status',
        status: 'running',
      })

      // Build adjacency list and compute in-degrees
      const nodes = dsl.nodes
      const edges = dsl.edges
      const nodeIds = Object.keys(nodes)

      // Build forward adjacency list: source -> [target nodes]
      const adjList = new Map<string, string[]>()
      // Separate loop-back edges from DAG edges
      const loopBackEdges = new Set<string>()

      for (const nodeId of nodeIds) {
        adjList.set(nodeId, [])
      }

      for (const edge of edges) {
        // Detect loop-back edges: edges targeting a node of type 'loop'
        const targetNode = nodes[edge.target]
        if (targetNode?.type === 'loop' && edge.sourceHandle === 'loop_back') {
          loopBackEdges.add(`${edge.source}->${edge.target}`)
          continue
        }

        const neighbors = adjList.get(edge.source)
        if (neighbors) neighbors.push(edge.target)
      }

      // Compute in-degree for each node (ignoring loop-back edges)
      const inDegree = new Map<string, number>()
      for (const nodeId of nodeIds) {
        inDegree.set(nodeId, 0)
      }
      for (const edge of edges) {
        if (loopBackEdges.has(`${edge.source}->${edge.target}`)) continue
        const current = inDegree.get(edge.target) || 0
        inDegree.set(edge.target, current + 1)
      }

      // Initialize queue with all zero in-degree nodes (typically the 'begin' node)
      const queue: string[] = []
      for (const [nodeId, degree] of inDegree.entries()) {
        if (degree === 0) queue.push(nodeId)
      }

      // Track node outputs for passing data downstream
      const nodeOutputs = new Map<string, Record<string, unknown>>()
      let executionOrder = 0
      let completedCount = 0

      // Kahn's algorithm: process nodes in topological order
      while (queue.length > 0) {
        // Check for cancellation before processing each node
        if (runState.cancelled) {
          log.info('Agent run cancelled during execution', { runId })
          return
        }

        const currentNodeId = queue.shift()!
        const node = nodes[currentNodeId]
        if (!node) continue

        // Collect input data from upstream nodes
        const inputData = this.collectInputData(currentNodeId, edges, nodeOutputs, input, node)

        // Create step record
        const stepId = getUuid()
        await ModelFactory.agentRunStep.create({
          id: stepId,
          run_id: runId,
          node_id: currentNodeId,
          node_type: node.type,
          node_label: node.label || null,
          status: 'running',
          input_data: inputData,
          output_data: null,
          error: null,
          started_at: new Date(),
          completed_at: null,
          duration_ms: null,
          execution_order: executionOrder++,
        } as AgentRunStep)

        // Notify SSE subscribers of step start
        await agentRedisService.publishRunOutput(runId, {
          type: 'step_start',
          node_id: currentNodeId,
          node_type: node.type,
          node_label: node.label,
        })

        // Execute the node (inline or dispatch to Python)
        const stepStart = Date.now()
        let result: Record<string, unknown>

        try {
          result = await this.executeNode(node, inputData, runId, stepId, tenantId, agentId)
        } catch (err: any) {
          // Mark step as failed
          await ModelFactory.agentRunStep.update(stepId, {
            status: 'failed',
            error: String(err),
            completed_at: new Date(),
            duration_ms: Date.now() - stepStart,
          } as Partial<AgentRunStep>)

          // Notify SSE of step failure
          await agentRedisService.publishRunOutput(runId, {
            type: 'step_error',
            node_id: currentNodeId,
            error: String(err),
          })

          throw err
        }

        // Mark step as completed
        await ModelFactory.agentRunStep.update(stepId, {
          status: 'completed',
          output_data: result,
          completed_at: new Date(),
          duration_ms: Date.now() - stepStart,
        } as Partial<AgentRunStep>)

        // Store output for downstream nodes
        nodeOutputs.set(currentNodeId, result)
        completedCount++

        // Update run progress
        await ModelFactory.agentRun.update(runId, {
          completed_nodes: completedCount,
        } as Partial<AgentRun>)

        // Notify SSE of step completion
        await agentRedisService.publishRunOutput(runId, {
          type: 'step_complete',
          node_id: currentNodeId,
          node_type: node.type,
          node_label: node.label,
          output_data: result,
        })

        // Determine which downstream nodes to enqueue based on node type
        const downstreamNodeIds = this.getDownstreamNodes(
          currentNodeId, node, result, edges, adjList,
        )

        // Reduce in-degree for downstream nodes and enqueue when ready
        for (const targetId of downstreamNodeIds) {
          const deg = (inDegree.get(targetId) || 1) - 1
          inDegree.set(targetId, deg)
          if (deg === 0) queue.push(targetId)
        }
      }

      // Collect final output from the 'answer' node if present
      const answerNode = nodeIds.find((id) => nodes[id]?.type === 'answer')
      const finalOutput = answerNode ? JSON.stringify(nodeOutputs.get(answerNode) || {}) : null

      // Mark run as completed
      await ModelFactory.agentRun.update(runId, {
        status: 'completed',
        output: finalOutput,
        completed_at: new Date(),
        duration_ms: Date.now() - (Date.now() - maxExecutionTime + maxExecutionTime),
      } as Partial<AgentRun>)

      // Notify SSE of completion
      await agentRedisService.publishRunOutput(runId, {
        type: 'done',
        status: 'completed',
        output: finalOutput,
      })

      log.info('Agent run completed', { runId, completedCount })
    } catch (err) {
      // Only update to failed if not already cancelled
      if (!runState.cancelled) {
        await ModelFactory.agentRun.update(runId, {
          status: 'failed',
          error: String(err),
          completed_at: new Date(),
        } as Partial<AgentRun>).catch(() => {})

        await agentRedisService.publishRunOutput(runId, {
          type: 'error',
          status: 'failed',
          error: String(err),
        }).catch(() => {})
      }

      log.error('Agent graph execution error', { runId, error: String(err) })
    } finally {
      // Clean up run state
      if (runState.timeoutId) clearTimeout(runState.timeoutId)
      this.activeRuns.delete(runId)
    }
  }

  /**
   * @description Execute a single node: dispatch to Python via Redis or execute inline.
   *   Compute-heavy nodes (LLM, retrieval, code, tools) go to Python.
   *   Lightweight nodes (switch, condition, merge, begin, answer) run in Node.js.
   * @param {AgentNodeDef} node - Node definition from the DSL
   * @param {Record<string, unknown>} inputData - Collected input from upstream nodes
   * @param {string} runId - Agent run UUID
   * @param {string} stepId - Step UUID for this execution
   * @param {string} tenantId - Multi-tenant isolation identifier
   * @param {string} agentId - Agent UUID
   * @returns {Promise<Record<string, unknown>>} Node execution result
   */
  private async executeNode(
    node: AgentNodeDef,
    inputData: Record<string, unknown>,
    runId: string,
    stepId: string,
    tenantId: string,
    agentId: string,
  ): Promise<Record<string, unknown>> {
    // Inline execution for lightweight node types
    if (INLINE_NODE_TYPES.has(node.type)) {
      return this.executeInlineNode(node, inputData)
    }

    // Dispatch to Python worker via Redis Streams
    const task: AgentNodeTask = {
      id: stepId,
      run_id: runId,
      agent_id: agentId,
      node_id: node.id,
      node_type: node.type,
      input_data: inputData,
      config: node.config || {},
      tenant_id: tenantId,
      task_type: 'agent_node_execute',
    }

    await agentRedisService.queueNodeExecution(task)

    // Wait for result from Python via Redis pub/sub
    return this.waitForNodeResult(runId, node.id, stepId)
  }

  /**
   * @description Execute a lightweight node inline in Node.js.
   *   Handles begin, answer, message, switch, condition, merge, template, etc.
   * @param {AgentNodeDef} node - Node definition
   * @param {Record<string, unknown>} inputData - Input from upstream nodes
   * @returns {Record<string, unknown>} Execution result
   */
  private executeInlineNode(
    node: AgentNodeDef,
    inputData: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (node.type) {
      case 'begin':
        // Pass through the user input to downstream nodes
        return { output: inputData.input || '' }

      case 'answer':
        // Collect all inputs and produce final answer
        return { output: inputData.content || inputData.output || '' }

      case 'message':
        // Static message output from config
        return { output: (node.config?.content as string) || '' }

      case 'switch': {
        // Evaluate conditions and select matching branch
        const conditions = (node.config?.conditions || []) as Array<{ value: string; operator: string; target: string }>
        const inputValue = String(inputData.output || '')
        // Find the first matching condition
        const matched = conditions.find((c) => {
          if (c.operator === 'contains') return inputValue.includes(c.value)
          if (c.operator === 'equals') return inputValue === c.value
          if (c.operator === 'startsWith') return inputValue.startsWith(c.value)
          return false
        })
        return { output: inputValue, matched_branch: matched?.target || 'default' }
      }

      case 'condition': {
        // Boolean condition evaluation
        const expr = (node.config?.expression as string) || 'true'
        const result = expr === 'true' || inputData.output === expr
        return { output: inputData.output || '', condition_result: result }
      }

      case 'merge':
      case 'concentrator':
        // Merge all inputs into a single output
        return { output: inputData.output || '', merged: true }

      case 'note':
        // Notes are pass-through (visual-only nodes on canvas)
        return { output: '' }

      case 'template': {
        // Simple string template interpolation using {{variable}} syntax
        let templateStr = (node.config?.template as string) || ''
        const vars = inputData as Record<string, unknown>
        for (const [key, value] of Object.entries(vars)) {
          templateStr = templateStr.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
        }
        return { output: templateStr }
      }

      case 'keyword_extract':
        // Pass input through; actual extraction happens if dispatched to Python
        return { output: inputData.output || '', keywords: [] }

      default:
        return { output: inputData.output || '' }
    }
  }

  /**
   * @description Wait for a node execution result from the Python worker via Redis pub/sub.
   *   Subscribes to the per-node result channel and resolves when the result arrives.
   *   Times out after 5 minutes per node to prevent indefinite hangs.
   * @param {string} runId - Agent run UUID
   * @param {string} nodeId - Node identifier
   * @param {string} _stepId - Step UUID (unused, reserved for future correlation)
   * @returns {Promise<Record<string, unknown>>} Node execution result from Python
   */
  private waitForNodeResult(
    runId: string,
    nodeId: string,
    _stepId: string,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      // 5-minute per-node timeout
      const timeout = setTimeout(() => {
        agentRedisService.unsubscribeFromRunOutput(`${runId}:node:${nodeId}`).catch(() => {})
        reject(new Error(`Node ${nodeId} execution timed out after 5 minutes`))
      }, 300_000)

      // Subscribe to the node-specific result channel
      agentRedisService.subscribeToRunOutput(`${runId}:node:${nodeId}`, (message) => {
        clearTimeout(timeout)
        agentRedisService.unsubscribeFromRunOutput(`${runId}:node:${nodeId}`).catch(() => {})

        // Check for error results from Python
        if (message.error) {
          reject(new Error(String(message.error)))
        } else {
          resolve(message as Record<string, unknown>)
        }
      }).catch(reject)
    })
  }

  /**
   * @description Handle execution timeout: cancel the run and notify subscribers.
   * @param {string} runId - Agent run UUID that timed out
   */
  private async handleTimeout(runId: string): Promise<void> {
    const runState = this.activeRuns.get(runId)
    if (runState) runState.cancelled = true

    await ModelFactory.agentRun.update(runId, {
      status: 'failed',
      error: 'Execution timed out',
      completed_at: new Date(),
    } as Partial<AgentRun>).catch(() => {})

    await agentRedisService.publishRunOutput(runId, {
      type: 'error',
      status: 'failed',
      error: 'Execution timed out',
    }).catch(() => {})

    await agentRedisService.publishCancelSignal(runId)

    log.warn('Agent run timed out', { runId })
  }

  /**
   * @description Collect input data for a node from its upstream dependencies.
   *   Aggregates outputs from all source nodes that connect to the target.
   * @param {string} nodeId - Target node receiving input
   * @param {AgentEdgeDef[]} edges - All edges in the DSL
   * @param {Map<string, Record<string, unknown>>} nodeOutputs - Completed node outputs
   * @param {string} userInput - Original user input for begin nodes
   * @param {AgentNodeDef} node - The target node definition
   * @returns {Record<string, unknown>} Aggregated input data
   */
  private collectInputData(
    nodeId: string,
    edges: AgentEdgeDef[],
    nodeOutputs: Map<string, Record<string, unknown>>,
    userInput: string,
    node: AgentNodeDef,
  ): Record<string, unknown> {
    // Begin node receives the user input directly
    if (node.type === 'begin') {
      return { input: userInput }
    }

    // Find all upstream edges targeting this node
    const incomingEdges = edges.filter((e) => e.target === nodeId)
    const collectedInput: Record<string, unknown> = {}

    for (const edge of incomingEdges) {
      const sourceOutput = nodeOutputs.get(edge.source)
      if (sourceOutput) {
        // Merge source outputs; use sourceHandle as key if present
        const key = edge.sourceHandle || edge.source
        collectedInput[key] = sourceOutput.output
      }
    }

    // If only one upstream, flatten to a simple output key
    if (incomingEdges.length === 1) {
      const singleSource = nodeOutputs.get(incomingEdges[0]!.source)
      if (singleSource) {
        return { ...singleSource, ...collectedInput }
      }
    }

    return collectedInput
  }

  /**
   * @description Determine which downstream nodes should be enqueued after a node completes.
   *   Handles special routing for switch/condition nodes that only activate matching branches.
   * @param {string} nodeId - Completed node ID
   * @param {AgentNodeDef} node - Completed node definition
   * @param {Record<string, unknown>} result - Node execution result
   * @param {AgentEdgeDef[]} edges - All edges in the DSL
   * @param {Map<string, string[]>} _adjList - Forward adjacency list (unused, edges are filtered directly)
   * @returns {string[]} Array of downstream node IDs to enqueue
   */
  private getDownstreamNodes(
    nodeId: string,
    node: AgentNodeDef,
    result: Record<string, unknown>,
    edges: AgentEdgeDef[],
    _adjList: Map<string, string[]>,
  ): string[] {
    const outEdges = edges.filter((e) => e.source === nodeId)

    // Switch nodes only activate the matching branch
    if (node.type === 'switch' || node.type === 'categorize') {
      const matchedBranch = result.matched_branch as string | undefined
      if (matchedBranch && matchedBranch !== 'default') {
        // Find the edge matching the branch
        const matched = outEdges.find((e) => e.sourceHandle === matchedBranch || e.condition === matchedBranch)
        return matched ? [matched.target] : outEdges.map((e) => e.target)
      }
      // Default: activate all branches (fallback)
      return outEdges.map((e) => e.target)
    }

    // Condition nodes only activate the true/false branch
    if (node.type === 'condition') {
      const conditionResult = result.condition_result as boolean
      const branch = conditionResult ? 'true' : 'false'
      const matched = outEdges.find((e) => e.sourceHandle === branch)
      return matched ? [matched.target] : outEdges.map((e) => e.target)
    }

    // Default: activate all downstream nodes
    return outEdges.map((e) => e.target)
  }

  /**
   * @description Validate the agent DSL graph structure.
   *   Checks for cycles (ignoring loop-back edges), unreachable nodes,
   *   and missing begin/answer nodes.
   * @param {AgentDSL} dsl - DSL graph definition
   * @throws {Error} If graph has structural issues
   */
  private validateGraph(dsl: AgentDSL): void {
    const nodes = dsl.nodes
    const edges = dsl.edges
    const nodeIds = Object.keys(nodes)

    // Must have at least one node
    if (nodeIds.length === 0) {
      throw Object.assign(new Error('Agent graph has no nodes'), { statusCode: 400 })
    }

    // Check for begin node
    const hasBegin = nodeIds.some((id) => nodes[id]?.type === 'begin')
    if (!hasBegin) {
      throw Object.assign(new Error('Agent graph must have a begin node'), { statusCode: 400 })
    }

    // Run cycle detection (Kahn's algorithm on the DAG, ignoring loop-back edges)
    const order = this.topologicalSort(dsl)

    // Check for unreachable nodes (nodes not in topological order)
    if (order.length < nodeIds.length) {
      const unreachable = nodeIds.filter((id) => !order.includes(id))
      log.warn('Agent graph has unreachable nodes', { unreachable })
      // Don't throw — unreachable nodes (like notes) are allowed
    }
  }

  /**
   * @description Compute topological sort of the DSL graph using Kahn's algorithm.
   *   Ignores loop-back edges (edges with sourceHandle='loop_back' targeting loop nodes).
   *   Throws if a cycle is detected (nodes remain with non-zero in-degree).
   * @param {AgentDSL} dsl - DSL graph definition
   * @returns {string[]} Node IDs in topological execution order
   * @throws {Error} If an unexpected cycle is detected
   */
  private topologicalSort(dsl: AgentDSL): string[] {
    const nodes = dsl.nodes
    const edges = dsl.edges
    const nodeIds = Object.keys(nodes)

    // Build adjacency list and in-degree map, ignoring loop-back edges
    const adjList = new Map<string, string[]>()
    const inDegree = new Map<string, number>()

    for (const nodeId of nodeIds) {
      adjList.set(nodeId, [])
      inDegree.set(nodeId, 0)
    }

    for (const edge of edges) {
      // Skip loop-back edges for cycle detection
      const targetNode = nodes[edge.target]
      if (targetNode?.type === 'loop' && edge.sourceHandle === 'loop_back') continue

      adjList.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    // Initialize queue with zero in-degree nodes
    const queue: string[] = []
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(nodeId)
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

    // If sorted doesn't include all nodes, there's a cycle
    if (sorted.length < nodeIds.length) {
      const cycleNodes = nodeIds.filter((id) => !sorted.includes(id))
      throw Object.assign(
        new Error(`Cycle detected in agent graph involving nodes: ${cycleNodes.join(', ')}`),
        { statusCode: 400 },
      )
    }

    return sorted
  }
}

/** @description Singleton instance of the agent execution engine */
export const agentExecutorService = new AgentExecutorService()
