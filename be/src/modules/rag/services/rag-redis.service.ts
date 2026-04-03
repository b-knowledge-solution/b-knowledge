/**
 * @fileoverview Direct Redis Streams communication with advance-rag task executors.
 *
 * Replaces the HTTP proxy to FastAPI — Node.js writes task messages
 * directly to the same Redis Streams that task_executor.py consumes.
 * Queue and consumer group names must match advance-rag/common/constants.py.
 *
 * @module modules/rag/services/rag-redis
 */

import { getRedisClient, type RedisClient } from '@/shared/services/redis.service.js';
import { log } from '@/shared/services/logger.service.js';
import { TaskMessage } from '@/shared/models/types.js';
import { getUuid } from '@/shared/utils/uuid.js';

// Must match advance-rag/common/constants.py
const SVR_QUEUE_NAME = 'rag_flow_svr_queue';
const SVR_CONSUMER_GROUP_NAME = 'rag_flow_svr_task_broker';

/**
 * @description Get the Redis Stream queue name for a given priority level.
 * Priority 0 uses the base queue; higher priorities use suffixed queues.
 * Matches Python settings.get_svr_queue_name().
 * @param {number} priority - Task priority level (0 = default)
 * @returns {string} Redis Stream key name
 */
function getQueueName(priority: number): string {
    // Priority 0 uses the base queue name
    if (priority === 0) return SVR_QUEUE_NAME;
    return `${SVR_QUEUE_NAME}_${priority}`;
}

// Re-export shared UUID utility for backward compatibility
export { getUuid } from '@/shared/utils/uuid.js';

/**
 * @description Format current time as 'HH:MM:SS' for progress messages
 * @returns {string} Formatted time string
 */
function timeStr(): string {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

/**
 * @description Format current time as 'YYYY-MM-DD HH:MM:SS' for task begin_at fields
 * @returns {string} Formatted datetime string
 */
function datetimeStr(): string {
    const d = new Date();
    return d.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * @description Service for communicating with advance-rag task executors via Redis Streams.
 * Provides methods to queue parse, advanced (GraphRAG/RAPTOR/Mindmap), and enrichment
 * tasks, as well as publishing progress updates and cancellation signals.
 */
export class RagRedisService {
    /**
     * @description Get the Redis client, throwing if not available
     * @returns {RedisClient} Active Redis client
     * @throws {Error} If Redis is not connected
     */
    private getClient(): RedisClient {
        const client = getRedisClient();
        if (!client) throw new Error('Redis not available');
        return client;
    }

    /**
     * @description Push a task message to the Redis Stream (XADD).
     * Creates the consumer group if it does not exist. Message format matches
     * the payload that task_executor.py's queue_consumer reads.
     * @param {TaskMessage} message - Task message payload
     * @param {number} [priority=0] - Task priority level (determines queue)
     * @returns {Promise<void>}
     */
    async queueTask(message: TaskMessage, priority = 0): Promise<void> {
        const client = this.getClient();
        const queueName = getQueueName(priority);

        // Ensure consumer group exists (matches Python behavior)
        try {
            await client.xGroupCreate(queueName, SVR_CONSUMER_GROUP_NAME, '0', { MKSTREAM: true });
        } catch (err: any) {
            // BUSYGROUP = group already exists, that's fine
            if (!err.message?.includes('BUSYGROUP')) {
                log.warn('Failed to create consumer group (may already exist)', { error: String(err) });
            }
        }

        // XADD with the same payload format as Python: {"message": JSON_STRING}
        await client.xAdd(queueName, '*', {
            message: JSON.stringify(message),
        });

        log.debug('Queued task to Redis Stream', { queueName, taskId: message.id, taskType: message.task_type });
    }

    /**
     * @description Queue a parse_init task for document parsing.
     * The Python task executor splits this into sub-tasks (PDF page splitting,
     * digest computation, chunk embedding, etc.)
     * @param {string} docId - Document UUID (hex, no hyphens)
     * @param {number} [priority=0] - Task priority level
     * @returns {Promise<string>} Generated task UUID
     */
    async queueParseInit(docId: string, priority = 0): Promise<string> {
        const taskId = getUuid();
        await this.queueTask({
            id: taskId,
            doc_id: docId,
            from_page: 0,
            to_page: 100000000,
            task_type: 'parse_init',
            priority,
            progress_msg: `${timeStr()} Task is queued...`,
            begin_at: datetimeStr(),
        }, priority);
        return taskId;
    }

    /**
     * @description Queue a GraphRAG, RAPTOR, or Mindmap task.
     * Uses the 'graph_raptor_x' fake doc ID convention that the Python task executor expects.
     * @param {'graphrag' | 'raptor' | 'mindmap'} taskType - Type of advanced task
     * @param {string} sampleDocId - A sample document ID from the dataset
     * @param {string[]} docIds - Array of document IDs to process
     * @param {number} [priority=0] - Task priority level
     * @returns {Promise<string>} Generated task UUID
     */
    async queueAdvancedTask(
        taskType: 'graphrag' | 'raptor' | 'mindmap',
        sampleDocId: string,
        docIds: string[],
        priority = 0,
    ): Promise<string> {
        const taskId = getUuid();
        const message: TaskMessage = {
            id: taskId,
            doc_id: 'graph_raptor_x', // GRAPH_RAPTOR_FAKE_DOC_ID
            from_page: 100000000,
            to_page: 100000000,
            task_type: taskType,
            priority,
            progress_msg: `${timeStr()} created task ${taskType}`,
            begin_at: datetimeStr(),
            doc_ids: docIds,
        };
        await this.queueTask(message, priority);
        return taskId;
    }

    /**
     * @description Queue a re-embed task for all chunks in a dataset.
     * The Python task executor will re-generate embeddings using the currently
     * configured embedding model. Uses a synthetic doc_id convention similar
     * to graph_raptor_x for dataset-level tasks.
     * @param {string} datasetId - Dataset UUID (hex, no hyphens)
     * @param {number} [priority=0] - Task priority level
     * @returns {Promise<string>} Generated task UUID
     */
    async queueReEmbed(datasetId: string, priority = 0): Promise<string> {
        const taskId = getUuid();
        await this.queueTask({
            id: taskId,
            doc_id: 'reembed_x', // Synthetic doc_id for dataset-level re-embed task
            from_page: 0,
            to_page: 100000000,
            task_type: 'reembed',
            priority,
            progress_msg: `${timeStr()} Re-embed task queued...`,
            begin_at: datetimeStr(),
            dataset_id: datasetId,
        }, priority);
        return taskId;
    }

    /**
     * @description Queue a per-document enrichment task (keyword extraction, question generation, tagging, or metadata)
     * @param {string} docId - Document UUID (hex, no hyphens)
     * @param {'keyword' | 'question' | 'tag' | 'metadata'} taskType - Enrichment type
     * @param {number} [priority=0] - Task priority level
     * @returns {Promise<string>} Generated task UUID
     */
    async queueEnrichmentTask(
        docId: string,
        taskType: 'keyword' | 'question' | 'tag' | 'metadata',
        priority = 0,
    ): Promise<string> {
        const taskId = getUuid();
        await this.queueTask({
            id: taskId,
            doc_id: docId,
            from_page: 0,
            to_page: 100000000,
            task_type: taskType,
            progress: 0.0,
            progress_msg: `${timeStr()} created task ${taskType}`,
            begin_at: datetimeStr(),
        }, priority);
        return taskId;
    }

    /**
     * @description Publish a progress update via Redis pub/sub for SSE streaming to clients
     * @param {string} taskId - Task UUID to publish progress for
     * @param {Record<string, unknown>} data - Progress data payload
     * @returns {Promise<void>}
     */
    async publishProgress(taskId: string, data: Record<string, unknown>): Promise<void> {
        const client = this.getClient();
        await client.publish(`task:${taskId}:progress`, JSON.stringify(data));
    }

    /**
     * @description Set a cancellation flag in Redis for a task.
     * The Python task executor checks for this key to abort processing.
     * @param {string} taskId - Task UUID to cancel
     * @returns {Promise<void>}
     */
    async cancelTask(taskId: string): Promise<void> {
        const client = this.getClient();
        await client.set(`${taskId}-cancel`, 'x');
    }
}

/** Singleton instance of the Redis task queue service */
export const ragRedisService = new RagRedisService();
