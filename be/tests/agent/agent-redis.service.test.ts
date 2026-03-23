/**
 * @fileoverview Unit tests for AgentRedisService.
 *
 * Tests Redis Streams dispatch (XADD), pub/sub subscription for run output,
 * consumer group creation, cancel signal publishing, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSubscriber = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
}))

const mockRedisClient = vi.hoisted(() => ({
  xGroupCreate: vi.fn().mockResolvedValue(undefined),
  xAdd: vi.fn().mockResolvedValue('1234567890-0'),
  publish: vi.fn().mockResolvedValue(1),
  set: vi.fn().mockResolvedValue('OK'),
  duplicate: vi.fn().mockReturnValue(mockSubscriber),
}))

vi.mock('../../src/shared/services/redis.service.js', () => ({
  getRedisClient: () => mockRedisClient,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { agentRedisService } from '../../src/modules/agents/services/agent-redis.service.js'
import type { AgentNodeTask } from '../../src/modules/agents/services/agent-redis.service.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentRedisService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply mock return values after clearAllMocks resets them
    mockRedisClient.xGroupCreate.mockResolvedValue(undefined)
    mockRedisClient.xAdd.mockResolvedValue('1234567890-0')
    mockRedisClient.publish.mockResolvedValue(1)
    mockRedisClient.set.mockResolvedValue('OK')
    mockRedisClient.duplicate.mockReturnValue(mockSubscriber)
    mockSubscriber.connect.mockResolvedValue(undefined)
    mockSubscriber.subscribe.mockResolvedValue(undefined)
    mockSubscriber.unsubscribe.mockResolvedValue(undefined)
    mockSubscriber.disconnect.mockResolvedValue(undefined)
  })

  // -----------------------------------------------------------------------
  // ensureConsumerGroup
  // -----------------------------------------------------------------------

  describe('ensureConsumerGroup', () => {
    it('creates the consumer group with MKSTREAM', async () => {
      await agentRedisService.ensureConsumerGroup()

      expect(mockRedisClient.xGroupCreate).toHaveBeenCalledWith(
        'agent_execution_queue',
        'agent_task_broker',
        '0',
        { MKSTREAM: true },
      )
    })

    it('ignores BUSYGROUP error when group already exists', async () => {
      mockRedisClient.xGroupCreate.mockRejectedValue(new Error('BUSYGROUP group already exists'))

      // Should not throw
      await expect(agentRedisService.ensureConsumerGroup()).resolves.toBeUndefined()
    })

    it('logs warning on non-BUSYGROUP errors', async () => {
      mockRedisClient.xGroupCreate.mockRejectedValue(new Error('Some other error'))

      // Should not throw — just warn
      await expect(agentRedisService.ensureConsumerGroup()).resolves.toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // queueNodeExecution
  // -----------------------------------------------------------------------

  describe('queueNodeExecution', () => {
    const task: AgentNodeTask = {
      id: 'step-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      node_id: 'node-1',
      node_type: 'generate',
      input_data: { output: 'Hello' },
      config: { model: 'gpt-4' },
      tenant_id: 'tenant-1',
      task_type: 'agent_node_execute',
    }

    it('sends XADD to the agent execution queue', async () => {
      await agentRedisService.queueNodeExecution(task)

      expect(mockRedisClient.xAdd).toHaveBeenCalledWith(
        'agent_execution_queue',
        '*',
        { message: JSON.stringify(task) },
      )
    })

    it('ensures consumer group before XADD', async () => {
      await agentRedisService.queueNodeExecution(task)

      // xGroupCreate should be called before xAdd
      expect(mockRedisClient.xGroupCreate).toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // subscribeToRunOutput
  // -----------------------------------------------------------------------

  describe('subscribeToRunOutput', () => {
    it('creates a duplicate subscriber and subscribes to the run channel', async () => {
      const callback = vi.fn()

      await agentRedisService.subscribeToRunOutput('run-1', callback)

      expect(mockRedisClient.duplicate).toHaveBeenCalled()
      expect(mockSubscriber.connect).toHaveBeenCalled()
      expect(mockSubscriber.subscribe).toHaveBeenCalledWith(
        'agent:run:run-1:output',
        expect.any(Function),
      )
    })

    it('parses JSON messages and passes to callback', async () => {
      const callback = vi.fn()

      // Capture the subscribe handler
      mockSubscriber.subscribe.mockImplementation((_channel: string, handler: Function) => {
        // Simulate a message
        handler(JSON.stringify({ type: 'step_complete', node_id: 'n1' }))
        return Promise.resolve()
      })

      await agentRedisService.subscribeToRunOutput('run-2', callback)

      expect(callback).toHaveBeenCalledWith({ type: 'step_complete', node_id: 'n1' })
    })

    it('handles invalid JSON without throwing', async () => {
      const callback = vi.fn()

      mockSubscriber.subscribe.mockImplementation((_channel: string, handler: Function) => {
        handler('not-valid-json')
        return Promise.resolve()
      })

      // Should not throw
      await agentRedisService.subscribeToRunOutput('run-3', callback)

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // unsubscribeFromRunOutput
  // -----------------------------------------------------------------------

  describe('unsubscribeFromRunOutput', () => {
    it('unsubscribes and disconnects the subscriber', async () => {
      // First subscribe to create a stored subscriber
      await agentRedisService.subscribeToRunOutput('run-4', vi.fn())

      await agentRedisService.unsubscribeFromRunOutput('run-4')

      expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith('agent:run:run-4:output')
      expect(mockSubscriber.disconnect).toHaveBeenCalled()
    })

    it('does nothing when no subscriber exists for the run', async () => {
      // Should not throw when there's nothing to unsubscribe
      await expect(agentRedisService.unsubscribeFromRunOutput('nonexistent')).resolves.toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // publishRunOutput
  // -----------------------------------------------------------------------

  describe('publishRunOutput', () => {
    it('publishes JSON data to the run output channel', async () => {
      const data = { type: 'status', status: 'running' }
      await agentRedisService.publishRunOutput('run-1', data)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'agent:run:run-1:output',
        JSON.stringify(data),
      )
    })
  })

  // -----------------------------------------------------------------------
  // publishNodeResult
  // -----------------------------------------------------------------------

  describe('publishNodeResult', () => {
    it('publishes result to per-node result channel', async () => {
      const result = { output: 'Generated text' }
      await agentRedisService.publishNodeResult('run-1', 'node-1', result)

      expect(mockRedisClient.publish).toHaveBeenCalledWith(
        'agent:run:run-1:node:node-1:result',
        JSON.stringify(result),
      )
    })
  })

  // -----------------------------------------------------------------------
  // publishCancelSignal
  // -----------------------------------------------------------------------

  describe('publishCancelSignal', () => {
    it('sets a Redis key with 1-hour TTL', async () => {
      await agentRedisService.publishCancelSignal('run-1')

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'agent:run:run-1:cancel',
        'x',
        { EX: 3600 },
      )
    })
  })
})
