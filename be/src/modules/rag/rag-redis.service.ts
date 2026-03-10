/**
 * Direct Redis Streams communication with advance-rag task executors.
 *
 * Replaces the HTTP proxy to FastAPI — Node.js writes task messages
 * directly to the same Redis Streams that task_executor.py consumes.
 */

import { getRedisClient, type RedisClient } from '@/shared/services/redis.service.js';
import { log } from '@/shared/services/logger.service.js';
import { randomUUID } from 'crypto';
import { TaskMessage } from '@/shared/models/types.js';

// Must match advance-rag/common/constants.py
const SVR_QUEUE_NAME = 'rag_flow_svr_queue';
const SVR_CONSUMER_GROUP_NAME = 'rag_flow_svr_task_broker';

/** Get the queue name for a given priority (matches Python settings.get_svr_queue_name) */
function getQueueName(priority: number): string {
    if (priority === 0) return SVR_QUEUE_NAME;
    return `${SVR_QUEUE_NAME}_${priority}`;
}

/** Generate UUID without hyphens (matches Python get_uuid()) */
export function getUuid(): string {
    return randomUUID().replace(/-/g, '');
}

/** Format current time as "HH:MM:SS" */
function timeStr(): string {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

/** Format current time as "YYYY-MM-DD HH:MM:SS" */
function datetimeStr(): string {
    const d = new Date();
    return d.toISOString().replace('T', ' ').slice(0, 19);
}



export class RagRedisService {
    private getClient(): RedisClient {
        const client = getRedisClient();
        if (!client) throw new Error('Redis not available');
        return client;
    }

    /**
     * Push a task message to the Redis Stream (XADD).
     * This is the same format that task_executor.py's queue_consumer reads.
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
     * Queue a parse_init task — the task executor will split it into
     * sub-tasks internally (PDF page splitting, digest computation, etc.)
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
     * Queue a graphrag/raptor/mindmap task.
     * Uses the "graph_raptor_x" fake doc ID that the task executor expects.
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
     * Queue a per-document enrichment task (keyword, question, tag, metadata).
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
     * Publish progress update via Redis pub/sub (for SSE streaming).
     */
    async publishProgress(taskId: string, data: Record<string, unknown>): Promise<void> {
        const client = this.getClient();
        await client.publish(`task:${taskId}:progress`, JSON.stringify(data));
    }

    /**
     * Set a cancel flag for a task.
     */
    async cancelTask(taskId: string): Promise<void> {
        const client = this.getClient();
        await client.set(`${taskId}-cancel`, 'x');
    }
}

export const ragRedisService = new RagRedisService();
