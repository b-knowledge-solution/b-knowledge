/**
 * @fileoverview Redis Streams dispatch service for agent node execution.
 *
 * Bridges the Node.js graph orchestrator and the Python agent worker.
 * Uses the same Redis Streams pattern as rag-redis.service.ts:
 * XADD/XREADGROUP with consumer groups for task dispatch, and
 * Redis pub/sub channels for streaming results back.
 *
 * Queue and consumer group names must match advance-rag/rag/agent/agent_consumer.py.
 *
 * @module modules/agents/services/agent-redis
 */

import { getRedisClient, type RedisClient } from '@/shared/services/redis.service.js'
import { log } from '@/shared/services/logger.service.js'

// Must match advance-rag/rag/agent/agent_consumer.py
const AGENT_QUEUE_NAME = 'agent_execution_queue'
const AGENT_CONSUMER_GROUP = 'agent_task_broker'
const AGENT_RESULT_PREFIX = 'agent:run:'

/**
 * @description Task payload dispatched to Python worker via Redis Streams.
 *   Each task represents a single node execution within an agent run.
 */
export interface AgentNodeTask {
  /** Task UUID (same as step ID) */
  id: string
  /** Agent run UUID */
  run_id: string
  /** Agent UUID */
  agent_id: string
  /** Node identifier from the DSL graph */
  node_id: string
  /** Operator type for dispatch (e.g., 'generate', 'retrieval', 'code') */
  node_type: string
  /** Input data passed to the node */
  input_data: Record<string, unknown>
  /** Node configuration from the DSL */
  config: Record<string, unknown>
  /** Multi-tenant isolation identifier */
  tenant_id: string
  /** Fixed task type discriminator for the consumer */
  task_type: 'agent_node_execute'
}

/**
 * @description Service for communicating with Python agent workers via Redis Streams.
 *   Provides methods to queue node execution tasks, subscribe to run output via pub/sub,
 *   and publish results/cancel signals between the orchestrator and worker.
 */
class AgentRedisService {
  /**
   * @description Get the Redis client, throwing if not available
   * @returns {RedisClient} Active Redis client
   * @throws {Error} If Redis is not connected
   */
  private getClient(): RedisClient {
    const client = getRedisClient()
    if (!client) throw new Error('Redis not available')
    return client
  }

  /**
   * @description Ensure the consumer group exists on the agent execution queue.
   *   Creates the stream with MKSTREAM if it does not exist. Ignores BUSYGROUP
   *   errors when the group is already created by another process.
   * @returns {Promise<void>}
   */
  async ensureConsumerGroup(): Promise<void> {
    const client = this.getClient()
    try {
      await client.xGroupCreate(AGENT_QUEUE_NAME, AGENT_CONSUMER_GROUP, '0', { MKSTREAM: true })
    } catch (err: any) {
      // BUSYGROUP = group already exists, that's fine
      if (!err.message?.includes('BUSYGROUP')) {
        log.warn('Failed to create agent consumer group (may already exist)', { error: String(err) })
      }
    }
  }

  /**
   * @description Queue a node execution task to the Redis Stream via XADD.
   *   The Python agent consumer picks up the task via XREADGROUP.
   *   Message format matches the JSON envelope pattern used by rag-redis.service.ts.
   * @param {AgentNodeTask} task - Node execution task payload
   * @returns {Promise<void>}
   */
  async queueNodeExecution(task: AgentNodeTask): Promise<void> {
    const client = this.getClient()

    // Ensure consumer group exists before first XADD
    await this.ensureConsumerGroup()

    // XADD with the same payload format as Python: {"message": JSON_STRING}
    await client.xAdd(AGENT_QUEUE_NAME, '*', {
      message: JSON.stringify(task),
    })

    log.debug('Queued agent node execution', {
      queueName: AGENT_QUEUE_NAME,
      taskId: task.id,
      nodeId: task.node_id,
      nodeType: task.node_type,
    })
  }

  /**
   * @description Subscribe to streaming output for an agent run via Redis pub/sub.
   *   The Python worker publishes delta events (token-by-token or step-complete)
   *   to the channel, which the SSE stream forwards to the client.
   * @param {string} runId - Agent run UUID
   * @param {(message: Record<string, unknown>) => void} callback - Handler for each incoming message
   * @returns {Promise<void>}
   */
  async subscribeToRunOutput(
    runId: string,
    callback: (message: Record<string, unknown>) => void,
  ): Promise<void> {
    const client = this.getClient()
    const channel = `${AGENT_RESULT_PREFIX}${runId}:output`

    // Create a duplicate client for subscription (Redis requires dedicated connection for pub/sub)
    const subscriber = client.duplicate()
    await subscriber.connect()

    await subscriber.subscribe(channel, (message: string) => {
      try {
        // Parse the JSON payload published by the worker
        const parsed = JSON.parse(message) as Record<string, unknown>
        callback(parsed)
      } catch (err) {
        log.warn('Failed to parse agent run output message', { runId, error: String(err) })
      }
    })

    // Store subscriber reference for cleanup
    this.subscribers.set(runId, subscriber)
    log.debug('Subscribed to agent run output', { runId, channel })
  }

  /**
   * @description Unsubscribe from a run's output channel and disconnect the subscriber client.
   * @param {string} runId - Agent run UUID
   * @returns {Promise<void>}
   */
  async unsubscribeFromRunOutput(runId: string): Promise<void> {
    const subscriber = this.subscribers.get(runId)
    if (subscriber) {
      const channel = `${AGENT_RESULT_PREFIX}${runId}:output`
      try {
        await subscriber.unsubscribe(channel)
        await subscriber.disconnect()
      } catch (err) {
        log.warn('Error unsubscribing from agent run output', { runId, error: String(err) })
      }
      this.subscribers.delete(runId)
    }
  }

  /**
   * @description Publish the result of a node execution back to the orchestrator.
   *   The graph executor subscribes to per-node result channels to know when
   *   a dispatched node has completed.
   * @param {string} runId - Agent run UUID
   * @param {string} nodeId - Node identifier that completed
   * @param {Record<string, unknown>} result - Node execution result data
   * @returns {Promise<void>}
   */
  async publishNodeResult(
    runId: string,
    nodeId: string,
    result: Record<string, unknown>,
  ): Promise<void> {
    const client = this.getClient()
    const channel = `${AGENT_RESULT_PREFIX}${runId}:node:${nodeId}:result`
    await client.publish(channel, JSON.stringify(result))
  }

  /**
   * @description Publish streaming output data for an agent run.
   *   Used by the Python worker to send token deltas, step status updates,
   *   and final output to the SSE stream.
   * @param {string} runId - Agent run UUID
   * @param {Record<string, unknown>} data - Output data to broadcast
   * @returns {Promise<void>}
   */
  async publishRunOutput(runId: string, data: Record<string, unknown>): Promise<void> {
    const client = this.getClient()
    const channel = `${AGENT_RESULT_PREFIX}${runId}:output`
    await client.publish(channel, JSON.stringify(data))
  }

  /**
   * @description Publish a cancellation signal for an agent run.
   *   Sets a Redis key that the Python worker checks to abort processing.
   * @param {string} runId - Agent run UUID
   * @returns {Promise<void>}
   */
  async publishCancelSignal(runId: string): Promise<void> {
    const client = this.getClient()
    // Set cancellation flag with 1-hour TTL (matches rag-redis pattern)
    await client.set(`agent:run:${runId}:cancel`, 'x', { EX: 3600 })
    log.info('Published cancel signal for agent run', { runId })
  }

  /** @description Map of run ID to subscriber client for cleanup */
  private subscribers = new Map<string, RedisClient>()
}

/** @description Singleton instance of the agent Redis dispatch service */
export const agentRedisService = new AgentRedisService()
