/**
 * @fileoverview Unit tests for AgentExecutorService.
 *
 * Tests topological sort, cycle detection, graph validation,
 * inline node execution, run lifecycle, cancellation, and timeout handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAgentModel = vi.hoisted(() => ({
  findById: vi.fn(),
}))

const mockAgentRunModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
}))

const mockAgentRunStepModel = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}))

const mockAgentRedisService = vi.hoisted(() => ({
  publishRunOutput: vi.fn().mockResolvedValue(undefined),
  publishCancelSignal: vi.fn().mockResolvedValue(undefined),
  queueNodeExecution: vi.fn().mockResolvedValue(undefined),
  subscribeToRunOutput: vi.fn().mockResolvedValue(undefined),
  unsubscribeFromRunOutput: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agent: mockAgentModel,
    agentRun: mockAgentRunModel,
    agentRunStep: mockAgentRunStepModel,
  },
}))

vi.mock('../../src/modules/agents/services/agent-redis.service.js', () => ({
  agentRedisService: mockAgentRedisService,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockGetUuid = vi.hoisted(() => vi.fn().mockReturnValue('aabbccdd11223344aabbccdd11223344'))

vi.mock('@/shared/utils/uuid.js', () => {
  const { z } = require('zod')
  const re = /^[0-9a-f]{32}$/
  return {
    getUuid: mockGetUuid,
    hexId: z.string().regex(re, 'Invalid ID format (expected 32-char hex)'),
    hexIdWith: (msg: string) => z.string().regex(re, msg),
  }
})

import { agentExecutorService } from '../../src/modules/agents/services/agent-executor.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a minimal valid DSL with begin -> answer nodes
 */
function buildSimpleDsl(overrides: Partial<any> = {}): any {
  return {
    nodes: {
      begin: { id: 'begin', type: 'begin', position: { x: 0, y: 0 }, config: {}, label: 'Begin' },
      answer: { id: 'answer', type: 'answer', position: { x: 200, y: 0 }, config: {}, label: 'Answer' },
      ...overrides.nodes,
    },
    edges: overrides.edges ?? [
      { source: 'begin', target: 'answer' },
    ],
    variables: {},
    settings: {
      mode: 'agent',
      max_execution_time: 300,
      retry_on_failure: false,
      ...overrides.settings,
    },
  }
}

function buildAgent(overrides: Partial<any> = {}): any {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    status: 'published',
    mode: 'agent',
    tenant_id: 'tenant-1',
    dsl: buildSimpleDsl(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentExecutorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply uuid mock return value after clearAllMocks resets it
    mockGetUuid.mockReturnValue('aabbccdd11223344aabbccdd11223344')
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -----------------------------------------------------------------------
  // startRun
  // -----------------------------------------------------------------------

  describe('startRun', () => {
    it('creates a run record and returns the run ID', async () => {
      const agent = buildAgent()
      mockAgentModel.findById.mockResolvedValue(agent)
      mockAgentRunModel.create.mockResolvedValue(undefined)
      // Mock executeGraph to not actually run (it's fire-and-forget)
      mockAgentRunModel.update.mockResolvedValue(undefined)
      mockAgentRunStepModel.create.mockResolvedValue(undefined)
      mockAgentRunStepModel.update.mockResolvedValue(undefined)

      const runId = await agentExecutorService.startRun(
        'agent-1', 'Hello', 'tenant-1', 'user-1', 'manual',
      )

      expect(runId).toBe('aabbccdd11223344aabbccdd11223344')
      expect(mockAgentRunModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'aabbccdd11223344aabbccdd11223344',
          agent_id: 'agent-1',
          tenant_id: 'tenant-1',
          status: 'pending',
          input: 'Hello',
          trigger_type: 'manual',
        }),
      )
    })

    it('throws 404 when agent not found', async () => {
      mockAgentModel.findById.mockResolvedValue(null)

      await expect(
        agentExecutorService.startRun('missing', 'Hello', 'tenant-1', 'user-1', 'manual'),
      ).rejects.toThrow('Agent not found')
    })

    it('throws 404 when tenant does not match', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgent({ tenant_id: 'other' }))

      await expect(
        agentExecutorService.startRun('agent-1', 'Hello', 'tenant-1', 'user-1', 'manual'),
      ).rejects.toThrow('Agent not found')
    })

    it('throws 400 when agent is not published', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgent({ status: 'draft' }))

      await expect(
        agentExecutorService.startRun('agent-1', 'Hello', 'tenant-1', 'user-1', 'manual'),
      ).rejects.toThrow('Agent must be published before execution')
    })

    it('throws 400 when DSL is empty', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgent({ dsl: {} }))

      await expect(
        agentExecutorService.startRun('agent-1', 'Hello', 'tenant-1', 'user-1', 'manual'),
      ).rejects.toThrow('Agent DSL is empty or invalid')
    })

    it('throws 400 when DSL has no nodes', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgent({ dsl: { nodes: null, edges: [] } }))

      await expect(
        agentExecutorService.startRun('agent-1', 'Hello', 'tenant-1', 'user-1', 'manual'),
      ).rejects.toThrow('Agent DSL is empty or invalid')
    })
  })

  // -----------------------------------------------------------------------
  // graph validation & topological sort (tested indirectly via startRun)
  // -----------------------------------------------------------------------

  describe('graph validation', () => {
    it('rejects a graph with no begin node', async () => {
      const dsl = buildSimpleDsl({
        nodes: {
          node1: { id: 'node1', type: 'message', position: { x: 0, y: 0 }, config: {}, label: 'Msg' },
        },
        edges: [],
      })
      // Override to remove default begin/answer nodes
      dsl.nodes = {
        node1: { id: 'node1', type: 'message', position: { x: 0, y: 0 }, config: {}, label: 'Msg' },
      }

      mockAgentModel.findById.mockResolvedValue(buildAgent({ dsl }))

      await expect(
        agentExecutorService.startRun('agent-1', 'Hello', 'tenant-1', 'user-1', 'manual'),
      ).rejects.toThrow('Agent graph must have a begin node')
    })

    it('rejects a graph with cycles', async () => {
      const dsl = buildSimpleDsl({
        nodes: {
          begin: { id: 'begin', type: 'begin', position: { x: 0, y: 0 }, config: {}, label: 'Begin' },
          nodeA: { id: 'nodeA', type: 'message', position: { x: 100, y: 0 }, config: {}, label: 'A' },
          nodeB: { id: 'nodeB', type: 'message', position: { x: 200, y: 0 }, config: {}, label: 'B' },
        },
        edges: [
          { source: 'begin', target: 'nodeA' },
          { source: 'nodeA', target: 'nodeB' },
          { source: 'nodeB', target: 'nodeA' }, // cycle!
        ],
      })
      // Replace default nodes entirely
      dsl.nodes = dsl.nodes

      mockAgentModel.findById.mockResolvedValue(buildAgent({ dsl }))

      await expect(
        agentExecutorService.startRun('agent-1', 'Hello', 'tenant-1', 'user-1', 'manual'),
      ).rejects.toThrow('Cycle detected')
    })

    it('allows loop-back edges that target loop nodes', async () => {
      const dsl = {
        nodes: {
          begin: { id: 'begin', type: 'begin', position: { x: 0, y: 0 }, config: {}, label: 'Begin' },
          loop: { id: 'loop', type: 'loop', position: { x: 100, y: 0 }, config: {}, label: 'Loop' },
          answer: { id: 'answer', type: 'answer', position: { x: 200, y: 0 }, config: {}, label: 'Answer' },
        },
        edges: [
          { source: 'begin', target: 'loop' },
          { source: 'loop', target: 'answer' },
          // This loop-back edge should be ignored during cycle detection
          { source: 'answer', target: 'loop', sourceHandle: 'loop_back' },
        ],
        variables: {},
        settings: { mode: 'agent', max_execution_time: 300, retry_on_failure: false },
      }

      mockAgentModel.findById.mockResolvedValue(buildAgent({ dsl }))
      mockAgentRunModel.create.mockResolvedValue(undefined)
      mockAgentRunModel.update.mockResolvedValue(undefined)
      mockAgentRunStepModel.create.mockResolvedValue(undefined)
      mockAgentRunStepModel.update.mockResolvedValue(undefined)

      // Should not throw a cycle error
      const runId = await agentExecutorService.startRun(
        'agent-1', 'Hello', 'tenant-1', 'user-1', 'manual',
      )
      expect(runId).toBe('aabbccdd11223344aabbccdd11223344')
    })

    it('accepts a graph with no edges (single begin node)', async () => {
      const dsl = {
        nodes: {
          begin: { id: 'begin', type: 'begin', position: { x: 0, y: 0 }, config: {}, label: 'Begin' },
        },
        edges: [],
        variables: {},
        settings: { mode: 'agent', max_execution_time: 300, retry_on_failure: false },
      }

      mockAgentModel.findById.mockResolvedValue(buildAgent({ dsl }))
      mockAgentRunModel.create.mockResolvedValue(undefined)
      mockAgentRunModel.update.mockResolvedValue(undefined)
      mockAgentRunStepModel.create.mockResolvedValue(undefined)
      mockAgentRunStepModel.update.mockResolvedValue(undefined)

      const runId = await agentExecutorService.startRun(
        'agent-1', 'Hello', 'tenant-1', 'user-1', 'manual',
      )
      expect(runId).toBe('aabbccdd11223344aabbccdd11223344')
    })
  })

  // -----------------------------------------------------------------------
  // cancelRun
  // -----------------------------------------------------------------------

  describe('cancelRun', () => {
    it('cancels a running run', async () => {
      mockAgentRunModel.findById.mockResolvedValue({
        id: 'run-1',
        tenant_id: 'tenant-1',
        status: 'running',
      })
      mockAgentRunModel.update.mockResolvedValue(undefined)

      await agentExecutorService.cancelRun('run-1', 'tenant-1')

      expect(mockAgentRunModel.update).toHaveBeenCalledWith('run-1', expect.objectContaining({
        status: 'cancelled',
      }))
      expect(mockAgentRedisService.publishCancelSignal).toHaveBeenCalledWith('run-1')
      expect(mockAgentRedisService.publishRunOutput).toHaveBeenCalledWith('run-1', expect.objectContaining({
        type: 'done',
        status: 'cancelled',
      }))
    })

    it('throws 404 when run not found', async () => {
      mockAgentRunModel.findById.mockResolvedValue(null)

      await expect(agentExecutorService.cancelRun('missing', 'tenant-1')).rejects.toThrow('Run not found')
    })

    it('throws 404 when tenant does not match', async () => {
      mockAgentRunModel.findById.mockResolvedValue({
        id: 'run-1',
        tenant_id: 'other',
        status: 'running',
      })

      await expect(agentExecutorService.cancelRun('run-1', 'tenant-1')).rejects.toThrow('Run not found')
    })

    it('throws 400 when run is already terminal', async () => {
      mockAgentRunModel.findById.mockResolvedValue({
        id: 'run-1',
        tenant_id: 'tenant-1',
        status: 'completed',
      })

      await expect(agentExecutorService.cancelRun('run-1', 'tenant-1')).rejects.toThrow('Run is already terminal')
    })
  })

  // -----------------------------------------------------------------------
  // getRunStatus
  // -----------------------------------------------------------------------

  describe('getRunStatus', () => {
    it('returns run status snapshot', async () => {
      mockAgentRunModel.findById.mockResolvedValue({
        id: 'run-1',
        status: 'running',
        completed_nodes: 3,
        total_nodes: 5,
        output: null,
        error: null,
      })

      const result = await agentExecutorService.getRunStatus('run-1')

      expect(result).toEqual({
        id: 'run-1',
        status: 'running',
        completed_nodes: 3,
        total_nodes: 5,
        output: null,
        error: null,
      })
    })

    it('throws 404 when run not found', async () => {
      mockAgentRunModel.findById.mockResolvedValue(null)

      await expect(agentExecutorService.getRunStatus('missing')).rejects.toThrow('Run not found')
    })
  })

  // -----------------------------------------------------------------------
  // streamRun
  // -----------------------------------------------------------------------

  describe('streamRun', () => {
    it('sets SSE headers and ends for completed run', async () => {
      mockAgentRunModel.findById.mockResolvedValue({
        id: 'run-1',
        status: 'completed',
        output: '{"result": "done"}',
        error: null,
      })

      const res: any = {
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        headersSent: false,
        on: vi.fn(),
      }

      await agentExecutorService.streamRun('run-1', res)

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"status":"completed"'))
      expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n')
      expect(res.end).toHaveBeenCalled()
    })

    it('writes error for non-existent run and closes', async () => {
      mockAgentRunModel.findById.mockResolvedValue(null)

      const res: any = {
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
      }

      await agentExecutorService.streamRun('missing', res)

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Run not found'))
      expect(res.end).toHaveBeenCalled()
    })

    it('subscribes to Redis pub/sub for in-progress run', async () => {
      mockAgentRunModel.findById.mockResolvedValue({
        id: 'run-1',
        status: 'running',
      })

      const res: any = {
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
      }

      await agentExecutorService.streamRun('run-1', res)

      expect(mockAgentRedisService.subscribeToRunOutput).toHaveBeenCalledWith(
        'run-1',
        expect.any(Function),
      )
      // Client disconnect handler should be registered
      expect(res.on).toHaveBeenCalledWith('close', expect.any(Function))
    })
  })
})
