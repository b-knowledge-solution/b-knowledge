/**
 * @fileoverview RAG Converter Service — Redis job queue management for document conversion.
 *
 * Manages the lifecycle of converter jobs via Redis, matching the key layout
 * expected by converter/src/worker.py:
 *   converter:vjob:{jobId}          — Hash: version job metadata
 *   converter:vjob:pending          — Sorted Set: pending job IDs
 *   converter:files:{jobId}         — Set: file tracking IDs
 *   converter:file:{fileId}         — Hash: per-file tracking
 *   converter:manual_trigger        — String: "1" if active
 *
 * @description Implements Singleton Pattern per coding guidelines.
 * @module modules/rag/services/rag-converter
 */
import { v4 as uuidv4 } from 'uuid'
import { getRedisClient } from '@/shared/services/redis.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import { ConverterJob } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'

// ============================================================================
// Redis Key Constants (must match converter/src/worker.py)
// ============================================================================

/** Prefix for version job hashes */
const VJOB_PREFIX = 'converter:vjob:'
/** Sorted set for pending job IDs (score = timestamp) */
const PENDING_SET = 'converter:vjob:pending'
/** Set of file IDs per job */
const FILES_PREFIX = 'converter:files:'
/** Prefix for per-file tracking hashes */
const FILE_PREFIX = 'converter:file:'
/** Manual trigger flag */
const MANUAL_TRIGGER_KEY = 'converter:manual_trigger'

// ============================================================================
// Types
// ============================================================================

/**
 * Converter job status stored in Redis and Postgres.
 */
export type ConverterJobStatus = 'pending' | 'converting' | 'finished' | 'failed'

/**
 * Per-file tracking record in Redis.
 */
export interface ConverterFileTracking {
  /** Unique file tracking ID */
  id: string
  /** Parent job ID */
  jobId: string
  /** Version ID */
  versionId: string
  /** Original file name */
  fileName: string
  /** File conversion status */
  status: string
  /** Error message if failed */
  error?: string | undefined
  /** ISO creation timestamp */
  createdAt: string
  /** ISO update timestamp */
  updatedAt: string
}

// ============================================================================
// Service
// ============================================================================

/**
 * RagConverterService manages converter jobs via Redis for document versions.
 * @description Singleton pattern — use exported instance.
 */
export class RagConverterService {
  private static instance: RagConverterService

  /**
   * Get the shared singleton instance.
   * @returns RagConverterService singleton
   */
  static getSharedInstance(): RagConverterService {
    if (!this.instance) {
      this.instance = new RagConverterService()
    }
    return this.instance
  }

  /**
   * Get the Redis client, throwing if not available.
   * @returns Active Redis client
   * @throws Error if Redis is not initialized
   */
  private getClient() {
    const client = getRedisClient()
    if (!client) {
      throw new Error('Redis client not available — converter queue requires Redis')
    }
    return client
  }

  // --------------------------------------------------------------------------
  // Enqueue Conversion Job
  // --------------------------------------------------------------------------

  /**
   * Create a converter job for a version and enqueue its files.
   * Creates both a Postgres record and Redis tracking entries.
   *
   * @param params - Job parameters
   * @returns The created ConverterJob record and per-file tracking IDs
   */
  async enqueueConversion(params: {
    datasetId: string
    versionId: string
    fileNames: string[]
  }): Promise<{ job: ConverterJob; fileTrackingIds: string[] }> {
    const client = this.getClient()
    const now = new Date().toISOString()
    const jobId = uuidv4()

    // Create Postgres job record
    const job = await ModelFactory.converterJob.create({
      id: jobId,
      dataset_id: params.datasetId,
      version_id: params.versionId,
      status: 'pending',
      file_count: params.fileNames.length,
      finished_count: 0,
      failed_count: 0,
    })

    // Create Redis job hash
    await client.hSet(`${VJOB_PREFIX}${jobId}`, {
      id: jobId,
      datasetId: params.datasetId,
      versionId: params.versionId,
      status: 'pending',
      fileCount: String(params.fileNames.length),
      finishedCount: '0',
      failedCount: '0',
      createdAt: now,
      updatedAt: now,
    })

    // Add to pending sorted set (score = current timestamp)
    await client.zAdd(PENDING_SET, {
      score: Date.now(),
      value: jobId,
    })

    // Create per-file tracking records in Redis
    const fileTrackingIds: string[] = []
    for (const fileName of params.fileNames) {
      const fileId = uuidv4()
      fileTrackingIds.push(fileId)

      // Store file hash
      await client.hSet(`${FILE_PREFIX}${fileId}`, {
        id: fileId,
        jobId,
        versionId: params.versionId,
        fileName,
        status: 'pending',
        error: '',
        createdAt: now,
        updatedAt: now,
      })

      // Add file ID to the job's file set
      await client.sAdd(`${FILES_PREFIX}${jobId}`, fileId)
    }

    log.info('Converter job enqueued', {
      jobId,
      versionId: params.versionId,
      fileCount: params.fileNames.length,
    })

    return { job, fileTrackingIds }
  }

  // --------------------------------------------------------------------------
  // Job Status
  // --------------------------------------------------------------------------

  /**
   * Get the converter job status from Redis, falling back to Postgres.
   * @param jobId - Job UUID
   * @returns Job status object or null if not found
   */
  async getJobStatus(jobId: string): Promise<{
    status: string
    fileCount: number
    finishedCount: number
    failedCount: number
    files: ConverterFileTracking[]
  } | null> {
    const client = this.getClient()

    // Try Redis first
    const redisData = await client.hGetAll(`${VJOB_PREFIX}${jobId}`)
    if (redisData && redisData.id) {
      // Load file tracking from Redis
      const fileIds = await client.sMembers(`${FILES_PREFIX}${jobId}`)
      const files: ConverterFileTracking[] = []
      for (const fileId of fileIds) {
        const fileData = await client.hGetAll(`${FILE_PREFIX}${fileId}`)
        if (fileData && fileData.id) {
          files.push({
            id: fileData.id ?? '',
            jobId: fileData.jobId ?? '',
            versionId: fileData.versionId ?? '',
            fileName: fileData.fileName ?? '',
            status: fileData.status ?? 'pending',
            error: fileData.error || undefined,
            createdAt: fileData.createdAt ?? '',
            updatedAt: fileData.updatedAt ?? '',
          })
        }
      }

      return {
        status: redisData.status ?? 'pending',
        fileCount: parseInt(redisData.fileCount ?? '0', 10),
        finishedCount: parseInt(redisData.finishedCount ?? '0', 10),
        failedCount: parseInt(redisData.failedCount ?? '0', 10),
        files,
      }
    }

    // Fall back to Postgres
    const pgJob = await ModelFactory.converterJob.findById(jobId)
    if (!pgJob) return null

    return {
      status: pgJob.status,
      fileCount: pgJob.file_count,
      finishedCount: pgJob.finished_count,
      failedCount: pgJob.failed_count,
      files: [],
    }
  }

  // --------------------------------------------------------------------------
  // Requeue Failed Files
  // --------------------------------------------------------------------------

  /**
   * Requeue failed files for a version by creating a new conversion job.
   * Reads failed files from the version's file records and enqueues them.
   *
   * @param datasetId - UUID of the dataset
   * @param versionId - UUID of the version
   * @returns The new converter job or null if no failed files
   */
  async requeueFailed(datasetId: string, versionId: string): Promise<ConverterJob | null> {
    // Find failed files in Postgres
    const files = await ModelFactory.documentVersionFile.findByVersionId(versionId)
    const failedFiles = files.filter(f => f.status === 'failed')

    if (failedFiles.length === 0) {
      log.info('No failed files to requeue', { versionId })
      return null
    }

    // Reset file statuses to pending
    for (const file of failedFiles) {
      await ModelFactory.documentVersionFile.update(file.id, {
        status: 'pending',
        error: null,
      })
    }

    // Enqueue new conversion job
    const { job } = await this.enqueueConversion({
      datasetId,
      versionId,
      fileNames: failedFiles.map(f => f.file_name),
    })

    log.info('Requeued failed files', {
      versionId,
      jobId: job.id,
      fileCount: failedFiles.length,
    })

    return job
  }

  // --------------------------------------------------------------------------
  // Manual Trigger
  // --------------------------------------------------------------------------

  /**
   * Set the manual trigger flag so the converter worker starts processing now.
   */
  async setManualTrigger(): Promise<void> {
    const client = this.getClient()
    // Set flag with 24-hour TTL
    await client.set(MANUAL_TRIGGER_KEY, '1', { EX: 86400 })
    log.info('Manual conversion trigger activated')
  }
}

/** Exported singleton instance */
export const ragConverterService = RagConverterService.getSharedInstance()
