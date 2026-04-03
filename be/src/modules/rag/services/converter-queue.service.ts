/**
 * @fileoverview Converter Queue Service — creates Redis jobs for the Python converter worker.
 *
 * Writes to the same Redis key layout that converter/src/worker.py reads:
 *   converter:vjob:{jobId}                 — Hash: version job metadata
 *   converter:vjob:status:{status}         — Set: job IDs by status
 *   converter:version:active_job:{verId}   — String: active job ID
 *   converter:files:{jobId}                — Set: file tracking IDs
 *   converter:file:{fileId}                — Hash: per-file tracking record
 *   converter:manual_trigger               — String: "1" to bypass schedule window
 *
 * @module modules/rag/services/converter-queue
 */
import { getRedisClient, type RedisClient } from '@/shared/services/redis.service.js'
import { log } from '@/shared/services/logger.service.js'
import { getUuid } from '@/shared/utils/uuid.js'

// Redis key constants — must match converter/src/worker.py exactly
const VJOB_KEY_PREFIX = 'converter:vjob:'
const STATUS_SET_PREFIX = 'converter:vjob:status:'
const ACTIVE_JOB_PREFIX = 'converter:version:active_job:'
const FILES_SET_PREFIX = 'converter:files:'
const FILE_KEY_PREFIX = 'converter:file:'
const MANUAL_TRIGGER_KEY = 'converter:manual_trigger'

/**
 * @description File metadata for a single file in a converter job
 */
export interface ConverterFileInput {
  /** Original file name */
  fileName: string
  /** Path to the source file relative to UPLOAD_DIR */
  filePath: string
}

/**
 * @description Parameters for creating a new converter job
 */
export interface CreateConverterJobInput {
  /** UUID of the parent dataset */
  datasetId: string
  /** UUID of the document version */
  versionId: string
  /** UUID of the project (for path resolution in converter worker) */
  projectId: string
  /** UUID of the document category (for path resolution in converter worker) */
  categoryId: string
  /** Files to convert */
  files: ConverterFileInput[]
  /** Optional converter config JSON (post-processing, suffixes, etc.) */
  config?: Record<string, unknown>
}

/**
 * @description Service for creating converter jobs in Redis.
 * The Python converter worker polls these keys to find work.
 */
export class ConverterQueueService {
  /**
   * @description Get the Redis client, throwing if not available
   * @returns {RedisClient} Active Redis client
   * @throws {Error} If Redis is not connected
   */
  private getClient(): RedisClient {
    const client = getRedisClient()
    if (!client) throw new Error('Redis not available for converter queue')
    return client
  }

  /**
   * @description Create a converter job and enqueue all files for processing.
   * Sets job status to 'converting' so the worker picks it up immediately.
   * @param {CreateConverterJobInput} input - Job creation parameters
   * @returns {Promise<string>} The created job ID
   */
  async createJob(input: CreateConverterJobInput): Promise<string> {
    const client = this.getClient()
    const jobId = getUuid()
    const now = new Date().toISOString()

    // Build the job metadata hash (matches what worker.py reads via hgetall)
    const jobData: Record<string, string> = {
      id: jobId,
      datasetId: input.datasetId,
      versionId: input.versionId,
      projectId: input.projectId,
      categoryId: input.categoryId,
      status: 'converting',
      fileCount: String(input.files.length),
      completedCount: '0',
      failedCount: '0',
      createdAt: now,
      updatedAt: now,
    }

    // Attach optional converter config as JSON string for worker to parse
    if (input.config) {
      jobData['config'] = JSON.stringify(input.config)
    }

    const jobKey = `${VJOB_KEY_PREFIX}${jobId}`
    const activeKey = `${ACTIVE_JOB_PREFIX}${input.versionId}`

    // Use pipeline for atomic batch write
    const pipeline = client.multi()

    // Create the job hash
    pipeline.hSet(jobKey, jobData)

    // Add job to 'converting' status set (worker looks here via SMEMBERS)
    pipeline.sAdd(`${STATUS_SET_PREFIX}converting`, jobId)

    // Set active job pointer for this version
    pipeline.set(activeKey, jobId)

    // Create per-file tracking records
    for (const file of input.files) {
      const fileId = getUuid()
      const fileKey = `${FILE_KEY_PREFIX}${fileId}`

      pipeline.hSet(fileKey, {
        id: fileId,
        jobId,
        fileName: file.fileName,
        filePath: file.filePath,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })

      // Add file ID to the job's file set
      pipeline.sAdd(`${FILES_SET_PREFIX}${jobId}`, fileId)
    }

    await pipeline.exec()

    log.info('Created converter job', {
      jobId,
      versionId: input.versionId,
      fileCount: input.files.length,
    })

    return jobId
  }

  /**
   * @description Set the manual trigger flag so the converter worker processes
   * jobs immediately, even outside its configured schedule window.
   * @returns {Promise<void>}
   */
  async triggerManualConversion(): Promise<void> {
    const client = this.getClient()
    await client.set(MANUAL_TRIGGER_KEY, '1')
    log.info('Converter manual trigger activated')
  }

  /**
   * @description Check the status of a converter job by reading its Redis hash.
   * @param {string} jobId - The converter job UUID
   * @returns {Promise<Record<string, string> | null>} Job data hash or null if not found
   */
  async getJobStatus(jobId: string): Promise<Record<string, string> | null> {
    const client = this.getClient()
    const data = await client.hGetAll(`${VJOB_KEY_PREFIX}${jobId}`)
    // hGetAll returns empty object for non-existent keys
    if (!data || !data['id']) return null
    return data
  }

  /**
   * @description Get all file tracking records for a converter job.
   * @param {string} jobId - The converter job UUID
   * @returns {Promise<Record<string, string>[]>} Array of file data hashes
   */
  async getJobFiles(jobId: string): Promise<Record<string, string>[]> {
    const client = this.getClient()
    const fileIds = await client.sMembers(`${FILES_SET_PREFIX}${jobId}`)
    if (!fileIds || fileIds.length === 0) return []

    const files: Record<string, string>[] = []
    for (const fileId of fileIds) {
      const fileData = await client.hGetAll(`${FILE_KEY_PREFIX}${fileId}`)
      if (fileData && fileData['id']) {
        files.push(fileData)
      }
    }
    return files
  }
}

/** Singleton instance of ConverterQueueService */
export const converterQueueService = new ConverterQueueService()
