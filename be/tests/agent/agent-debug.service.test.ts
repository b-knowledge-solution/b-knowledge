/**
 * @fileoverview Unit tests for AgentDebugService.
 *
 * Tests debug run lifecycle, step-by-step execution, breakpoints,
 * continue-to-breakpoint, and Socket.IO event emission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAgentModel = vi.hoisted(() => ({
  findById: vi.fn(),
}))

const mockAgentRunModel = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
}))

const mockAgentRunStepModel = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue(undefined),
  update: vi.fn().mockResolvedValue(undefined),
  findByRun: vi.fn(),
}))

const mockSocketService = vi.hoisted(() => ({
  emitToUser: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agent: mockAgentModel,
    agentRun: mockAgentRunModel,
    agentRunStep: mockAgentRunStepModel,
  },
}))

vi.mock('../../src/shared/services/socket.service.js', () => ({
  socketService: mockSocketService,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/modules/agents/services/agent-executor.service.js', () => ({
  agentExecutorService: {},
}))

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('debug-run-uuid'),
}))

import { agentDebugService } from '../../src/modules/agents/services/agent-debug.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgentWithDsl(): any {
  return {
    id: 'agent-1',
    name: 'Debug Agent',
    status: 'draft',
    mode: 'agent',
    tenant_id: 'tenant-1',
    dsl: {
      nodes: {
        begin: { id: 'begin', type: 'begin', label: 'Begin', config: {} },
        msg: { id: 'msg', type: 'message', label: 'Message', config: { content: 'Hello!' } },
        answer: { id: 'answer', type: 'answer', label: 'Answer', config: {} },
      },
      edges: [
        { source: 'begin', target: 'msg' },
        { source: 'msg', target: 'answer' },
      ],
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentDebugService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // startDebugRun
  // -----------------------------------------------------------------------

  describe('startDebugRun', () => {
    it('creates a debug run and returns the run ID', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())

      const runId = await agentDebugService.startDebugRun('agent-1', 'test input', 'tenant-1', 'user-1')

      expect(runId).toBe('debug-run-uuid')
      expect(mockAgentRunModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'debug-run-uuid',
          agent_id: 'agent-1',
          status: 'pending',
          trigger_type: 'manual',
        }),
      )
    })

    it('emits pending status for all nodes via Socket.IO', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())

      await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')

      // Should emit pending for each node in topological order
      const pendingCalls = mockSocketService.emitToUser.mock.calls.filter(
        (c: any[]) => c[1] === 'agent:debug:step' && c[2].status === 'pending',
      )
      expect(pendingCalls.length).toBe(3) // begin, msg, answer
    })

    it('throws 404 when agent not found', async () => {
      mockAgentModel.findById.mockResolvedValue(null)

      await expect(
        agentDebugService.startDebugRun('missing', 'test', 'tenant-1', 'user-1'),
      ).rejects.toThrow('Agent not found')
    })

    it('throws 404 when tenant does not match', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      // Modify the returned agent to have a different tenant
      mockAgentModel.findById.mockResolvedValue({
        ...buildAgentWithDsl(),
        tenant_id: 'other-tenant',
      })

      await expect(
        agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1'),
      ).rejects.toThrow('Agent not found')
    })

    it('throws 400 when DSL is empty', async () => {
      mockAgentModel.findById.mockResolvedValue({
        ...buildAgentWithDsl(),
        dsl: {},
      })

      await expect(
        agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1'),
      ).rejects.toThrow('Agent DSL is empty or invalid')
    })
  })

  // -----------------------------------------------------------------------
  // stepNext
  // -----------------------------------------------------------------------

  describe('stepNext', () => {
    it('executes the next node and emits running then completed events', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())

      const runId = await agentDebugService.startDebugRun('agent-1', 'test input', 'tenant-1', 'user-1')
      vi.clearAllMocks()

      await agentDebugService.stepNext(runId, 'user-1')

      // Should emit 'running' then 'completed' for the first node
      const debugCalls = mockSocketService.emitToUser.mock.calls.filter(
        (c: any[]) => c[1] === 'agent:debug:step',
      )
      expect(debugCalls.length).toBeGreaterThanOrEqual(2)

      const statuses = debugCalls.map((c: any[]) => c[2].status)
      expect(statuses).toContain('running')
      expect(statuses).toContain('completed')
    })

    it('creates a step record in the database', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())

      const runId = await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')
      vi.clearAllMocks()

      await agentDebugService.stepNext(runId, 'user-1')

      expect(mockAgentRunStepModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          run_id: runId,
          status: 'running',
        }),
      )
    })

    it('throws 404 when debug run not found', async () => {
      await expect(
        agentDebugService.stepNext('nonexistent', 'user-1'),
      ).rejects.toThrow('Debug run not found')
    })

    it('throws 403 when user does not own the debug run', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      const runId = await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')

      await expect(
        agentDebugService.stepNext(runId, 'other-user'),
      ).rejects.toThrow('Not authorized')
    })

    it('throws 400 when all nodes have been executed', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      const runId = await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')

      // Execute all 3 nodes
      await agentDebugService.stepNext(runId, 'user-1')
      await agentDebugService.stepNext(runId, 'user-1')
      await agentDebugService.stepNext(runId, 'user-1')

      // Fourth step should fail
      await expect(
        agentDebugService.stepNext(runId, 'user-1'),
      ).rejects.toThrow()
    })
  })

  // -----------------------------------------------------------------------
  // continueRun
  // -----------------------------------------------------------------------

  describe('continueRun', () => {
    it('executes all remaining nodes', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      const runId = await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')
      vi.clearAllMocks()

      await agentDebugService.continueRun(runId, 'user-1')

      // All 3 nodes should have step records created
      expect(mockAgentRunStepModel.create).toHaveBeenCalledTimes(3)
    })

    it('pauses at breakpoints during continue', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      const runId = await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')

      // Set breakpoint on the 'answer' node (3rd in topological order)
      agentDebugService.setBreakpoint(runId, 'answer')
      vi.clearAllMocks()

      await agentDebugService.continueRun(runId, 'user-1')

      // Should execute begin and msg, but stop before answer
      expect(mockAgentRunStepModel.create).toHaveBeenCalledTimes(2)
    })

    it('throws 404 when debug run not found', async () => {
      await expect(
        agentDebugService.continueRun('nonexistent', 'user-1'),
      ).rejects.toThrow('Debug run not found')
    })

    it('throws 403 when user does not own the run', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      const runId = await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')

      await expect(
        agentDebugService.continueRun(runId, 'other-user'),
      ).rejects.toThrow('Not authorized')
    })
  })

  // -----------------------------------------------------------------------
  // setBreakpoint / removeBreakpoint
  // -----------------------------------------------------------------------

  describe('setBreakpoint', () => {
    it('adds a breakpoint to the debug state', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      const runId = await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')

      // Should not throw
      agentDebugService.setBreakpoint(runId, 'msg')
    })

    it('throws 404 when debug run not found', () => {
      expect(() => agentDebugService.setBreakpoint('nonexistent', 'node')).toThrow('Debug run not found')
    })
  })

  describe('removeBreakpoint', () => {
    it('removes a breakpoint from the debug state', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      const runId = await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')

      agentDebugService.setBreakpoint(runId, 'msg')
      agentDebugService.removeBreakpoint(runId, 'msg')

      // After removing breakpoint, continueRun should not stop at 'msg'
      vi.clearAllMocks()
      await agentDebugService.continueRun(runId, 'user-1')
      // All 3 nodes should execute
      expect(mockAgentRunStepModel.create).toHaveBeenCalledTimes(3)
    })

    it('throws 404 when debug run not found', () => {
      expect(() => agentDebugService.removeBreakpoint('nonexistent', 'node')).toThrow('Debug run not found')
    })
  })

  // -----------------------------------------------------------------------
  // getStepDetails
  // -----------------------------------------------------------------------

  describe('getStepDetails', () => {
    it('returns step record for a given node', async () => {
      const step = { id: 'step-1', run_id: 'run-1', node_id: 'begin', status: 'completed' }
      mockAgentRunStepModel.findByRun.mockResolvedValue([step])

      const result = await agentDebugService.getStepDetails('run-1', 'begin')

      expect(result).toBe(step)
    })

    it('throws 404 when step not found for the node', async () => {
      mockAgentRunStepModel.findByRun.mockResolvedValue([])

      await expect(
        agentDebugService.getStepDetails('run-1', 'nonexistent'),
      ).rejects.toThrow('Step not found')
    })
  })

  // -----------------------------------------------------------------------
  // Socket.IO events
  // -----------------------------------------------------------------------

  describe('Socket.IO events', () => {
    it('emits agent:debug:step events to the correct user', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgentWithDsl())
      await agentDebugService.startDebugRun('agent-1', 'test', 'tenant-1', 'user-1')

      // All emitToUser calls should target 'user-1' with the correct event name
      for (const call of mockSocketService.emitToUser.mock.calls) {
        expect(call[0]).toBe('user-1')
        expect(call[1]).toBe('agent:debug:step')
        expect(call[2]).toHaveProperty('run_id')
        expect(call[2]).toHaveProperty('node_id')
        expect(call[2]).toHaveProperty('status')
      }
    })
  })
})
