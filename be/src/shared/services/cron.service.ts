
// Schedules and runs recurring maintenance tasks like temp cache cleanup and parsing scheduler.
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { config } from '@/shared/config/index.js';
import { log } from '@/shared/services/logger.service.js';
import { ModelFactory } from '@/shared/models/factory.js';

/**
 * @description Singleton service that schedules and runs recurring maintenance tasks.
 * Handles temp cache file cleanup and document parsing scheduling from system config.
 */
export class CronService {
    /** Reference to the active parsing scheduler task for stop/restart */
    private parsingTask: ScheduledTask | null = null;

    /**
     * @description Start the temp file cleanup cron job using node-cron.
     * Registers a scheduled task that periodically removes expired files from temp cache.
     * @returns {void}
     */
    public startCleanupJob() {
        // Log startup configuration
        log.info('Starting temp file cleanup cron job', {
            schedule: config.tempFileCleanupSchedule,
            ttlMs: config.tempFileTTL,
            tempPath: config.tempCachePath
        });

        // Register the cleanup task with node-cron matches config schedule
        cron.schedule(config.tempFileCleanupSchedule, async () => {
            await this.runCleanup();
        });
    }

    /**
     * @description Execute the temp file cleanup process.
     * Scans the temp directory and deletes files older than the configured TTL.
     * @returns {Promise<void>}
     */
    private async runCleanup() {
        log.debug('Running scheduled temp file cleanup');
        const tempPath = config.tempCachePath;

        try {
            try {
                // Check if temp directory exists
                await fs.access(tempPath, constants.F_OK);
            } catch {
                log.warn('Temp directory does not exist, skipping cleanup', { tempPath });
                return;
            }

            // List all files in temp directory
            const files = await fs.readdir(tempPath);
            const now = Date.now();
            let deletedCount = 0;
            let errorCount = 0;

            // Iterate over each file to check age
            for (const file of files) {
                const filePath = path.join(tempPath, file);
                try {
                    // Get file stats to check modification time
                    const stats = await fs.stat(filePath);
                    const age = now - stats.mtimeMs;

                    // If file is older than TTL, delete it
                    if (age > config.tempFileTTL) {
                        await fs.unlink(filePath);
                        deletedCount++;
                        log.debug('Deleted expired temp file', { file, age });
                    }
                } catch (err) {
                    // Log error but continue with next file
                    errorCount++;
                    log.error('Error processing file during cleanup', { file, error: err });
                }
            }

            // Log summary of cleanup operation
            if (deletedCount > 0 || errorCount > 0) {
                log.info('Temp file cleanup completed', { deletedCount, errorCount, totalScanned: files.length });
            } else {
                log.debug('Temp file cleanup completed - no files expired');
            }

        } catch (error) {
            // Catch top-level errors in the cron job
            log.error('Critical error in temp file cleanup job', { error });
        }
    }
    // -------------------------------------------------------------------------
    // Parsing Scheduler
    // -------------------------------------------------------------------------

    /**
     * @description Start the parsing scheduler with the given cron schedule.
     * When triggered, queries datasets for documents in 'pending' parse status
     * and enqueues them for parsing via the Redis task queue.
     * @param {string} schedule - Valid cron expression for scheduling
     * @returns {void}
     */
    public startParsingScheduler(schedule: string): void {
        // Stop any existing parsing scheduler before starting a new one
        if (this.parsingTask) {
            this.parsingTask.stop()
            this.parsingTask = null
        }

        log.info('Starting parsing scheduler', { schedule })

        this.parsingTask = cron.schedule(schedule, async () => {
            await this.runParsingSchedule()
        })
    }

    /**
     * @description Maximum number of documents to enqueue per dataset in a single scheduling run.
     * Prevents one large dataset from starving others by capping the batch size per kb_id.
     */
    private static readonly PER_DATASET_LIMIT = 10

    /**
     * @description Execute the scheduled parsing run with dataset-aware FIFO sequencing.
     * Groups pending documents by dataset (kb_id), processes each dataset batch in FIFO
     * order (oldest first by create_time), and enqueues up to PER_DATASET_LIMIT documents
     * per dataset. This prevents a single large dataset from monopolizing the parse queue.
     * @returns {Promise<void>}
     */
    private async runParsingSchedule(): Promise<void> {
        log.info('Running scheduled parsing job')

        try {
            // Import ragRedisService lazily to avoid circular dependency at module load time
            const { ragRedisService } = await import('@/modules/rag/services/rag-redis.service.js')
            const { ragDocumentService } = await import('@/modules/rag/services/rag-document.service.js')

            // Query pending documents ordered by dataset, then by creation time (FIFO)
            const pendingDocs = await ModelFactory.ragDocument.findPendingForParsing()

            if (pendingDocs.length === 0) {
                log.debug('No pending documents found for scheduled parsing')
                return
            }

            // Group pending documents by dataset for sequential dataset processing
            const datasetGroups = new Map<string, typeof pendingDocs>()
            for (const doc of pendingDocs) {
                const group = datasetGroups.get(doc.kb_id) || []
                group.push(doc)
                datasetGroups.set(doc.kb_id, group)
            }

            let totalQueued = 0

            // Process one dataset batch at a time with per-dataset limit
            for (const [kbId, group] of datasetGroups) {
                // Take at most PER_DATASET_LIMIT documents from this dataset
                const batch = group.slice(0, CronService.PER_DATASET_LIMIT)

                for (const doc of batch) {
                    try {
                        // Mark the document as queued for parsing
                        await ragDocumentService.beginParse(doc.id)
                        // Queue the parse_init task to the Redis Stream
                        await ragRedisService.queueParseInit(doc.id)
                        totalQueued++
                        log.debug('Scheduled parsing for document', { docId: doc.id, kbId: doc.kb_id })
                    } catch (err) {
                        log.warn('Failed to queue document for scheduled parsing', {
                            docId: doc.id,
                            error: String(err),
                        })
                    }
                }

                log.info('Scheduled parsing for dataset batch', {
                    kbId,
                    queued: batch.length,
                    remaining: group.length - batch.length,
                })
            }

            log.info('Scheduled parsing job completed', {
                totalQueued,
                datasetsProcessed: datasetGroups.size,
            })
        } catch (error) {
            log.error('Critical error in parsing scheduler job', { error: String(error) })
        }
    }

    /**
     * @description Update the parsing scheduler cron expression.
     * Validates the new schedule, persists it to system_configs, and restarts the scheduler.
     * @param {string} schedule - New cron expression
     * @returns {Promise<void>}
     * @throws {Error} If the cron expression is invalid
     */
    public async updateParsingSchedule(schedule: string): Promise<void> {
        // Validate the cron expression before persisting
        if (!cron.validate(schedule)) {
            throw new Error(`Invalid cron expression: ${schedule}`)
        }

        // Persist to system_configs table
        const existing = await ModelFactory.systemConfig.findById('parsing_scheduler_cron')
        if (existing) {
            await ModelFactory.systemConfig.update('parsing_scheduler_cron', { value: schedule })
        } else {
            await ModelFactory.systemConfig.create({ key: 'parsing_scheduler_cron', value: schedule })
        }

        // Restart the scheduler with the new expression
        this.startParsingScheduler(schedule)
        log.info('Parsing schedule updated', { schedule })
    }

    /**
     * @description Initialize the parsing scheduler from system config on boot.
     * Reads the schedule and enabled flag from system_configs table.
     * Should be called during application startup.
     * @returns {Promise<void>}
     */
    public async initParsingSchedulerFromConfig(): Promise<void> {
        try {
            const enabledConfig = await ModelFactory.systemConfig.findById('parsing_scheduler_enabled')
            const scheduleConfig = await ModelFactory.systemConfig.findById('parsing_scheduler_cron')

            // Only start if explicitly enabled in system config
            if (enabledConfig?.value === 'true' && scheduleConfig?.value) {
                // Validate before starting to avoid crashing on invalid stored config
                if (cron.validate(scheduleConfig.value)) {
                    this.startParsingScheduler(scheduleConfig.value)
                } else {
                    log.warn('Invalid stored parsing scheduler cron expression', {
                        schedule: scheduleConfig.value,
                    })
                }
            } else {
                log.debug('Parsing scheduler is not enabled in system config')
            }
        } catch (error) {
            log.warn('Failed to initialize parsing scheduler from config', { error: String(error) })
        }
    }

    /**
     * @description Get the current parsing scheduler configuration.
     * @returns {Promise<{ schedule: string; enabled: boolean }>} Current schedule and enabled status
     */
    public async getParsingSchedulerConfig(): Promise<{ schedule: string; enabled: boolean }> {
        const enabledConfig = await ModelFactory.systemConfig.findById('parsing_scheduler_enabled')
        const scheduleConfig = await ModelFactory.systemConfig.findById('parsing_scheduler_cron')

        return {
            schedule: scheduleConfig?.value || '0 2 * * *',
            enabled: enabledConfig?.value === 'true',
        }
    }

    /**
     * @description Set parsing scheduler enabled/disabled state and optionally update schedule.
     * Persists to system_configs and starts/stops the scheduler accordingly.
     * @param {boolean} enabled - Whether to enable the scheduler
     * @param {string} [schedule] - Optional new cron schedule expression
     * @returns {Promise<{ schedule: string; enabled: boolean }>} Updated config
     * @throws {Error} If the provided schedule is an invalid cron expression
     */
    public async setParsingSchedulerConfig(
        enabled: boolean,
        schedule?: string,
    ): Promise<{ schedule: string; enabled: boolean }> {
        // Validate schedule if provided
        if (schedule && !cron.validate(schedule)) {
            throw new Error(`Invalid cron expression: ${schedule}`)
        }

        // Persist enabled flag
        const existingEnabled = await ModelFactory.systemConfig.findById('parsing_scheduler_enabled')
        if (existingEnabled) {
            await ModelFactory.systemConfig.update('parsing_scheduler_enabled', { value: String(enabled) })
        } else {
            await ModelFactory.systemConfig.create({ key: 'parsing_scheduler_enabled', value: String(enabled) })
        }

        // Persist schedule if provided
        if (schedule) {
            const existingSchedule = await ModelFactory.systemConfig.findById('parsing_scheduler_cron')
            if (existingSchedule) {
                await ModelFactory.systemConfig.update('parsing_scheduler_cron', { value: schedule })
            } else {
                await ModelFactory.systemConfig.create({ key: 'parsing_scheduler_cron', value: schedule })
            }
        }

        // Start or stop the scheduler based on enabled flag
        if (enabled) {
            const currentSchedule = schedule
                || (await ModelFactory.systemConfig.findById('parsing_scheduler_cron'))?.value
                || '0 2 * * *'
            this.startParsingScheduler(currentSchedule)
        } else if (this.parsingTask) {
            this.parsingTask.stop()
            this.parsingTask = null
            log.info('Parsing scheduler stopped')
        }

        return this.getParsingSchedulerConfig()
    }
}

/** Singleton instance of the cron service for scheduling maintenance tasks */
export const cronService = new CronService();
