/**
 * @fileoverview Queue service for background job processing using Bee-Queue.
 *
 * Implements smart concurrency calculation based on system resources (CPU cores)
 * and database connection pool limits to avoid overloading either resource.
 *
 * @module shared/services/queue
 */
import Queue from 'bee-queue';
import os from 'os';
import { config } from '@/shared/config/index.js';
import { log } from '@/shared/services/logger.service.js';
import { ModelFactory } from '@/shared/models/factory.js';

/**
 * @description Singleton service that manages background job processing using Bee-Queue.
 * Calculates optimal concurrency based on CPU cores and database pool size
 * to prevent resource exhaustion.
 */
export class QueueService {
    /** Singleton instance */
    private static instance: QueueService;

    /** Database connection pool size (should match postgresql adapter) */
    private static readonly DB_POOL_SIZE = 20;

    /** Computed optimal concurrency for job processing */
    private readonly optimalConcurrency: number;

    /**
     * @description Private constructor to initialize the QueueService singleton.
     * Sets up Redis connection, calculates optimal concurrency, and logs startup details.
     */
    private constructor() {
        // Calculate optimal concurrency based on system resources
        this.optimalConcurrency = this.calculateOptimalConcurrency();

        // Configure Redis connection settings from application config
        const redisConfig = {
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            db: config.redis.db,
        };

        // Log successful startup with connection and concurrency details
        log.info('BeeQueue service started successfully', {
            queues: [],
            redisHost: config.redis.host,
            redisPort: config.redis.port,
            concurrency: this.optimalConcurrency,
            cpuCores: os.cpus().length,
            dbPoolSize: QueueService.DB_POOL_SIZE,
        });
    }

    /**
     * @description Calculate optimal concurrency based on system resources.
     * Considers CPU cores, database pool size, and queue count to prevent
     * overloading either resource.
     *
     * Formula: min(envOverride, cpuCores * 2, dbPoolSize / numQueues)
     *
     * @returns {number} Optimal concurrency per queue (minimum 1)
     */
    private calculateOptimalConcurrency(): number {
        // Check for environment variable override first
        const envConcurrency = process.env['QUEUE_CONCURRENCY'];
        if (envConcurrency) {
            const parsed = parseInt(envConcurrency, 10);
            if (!isNaN(parsed) && parsed > 0) {
                log.debug('Using QUEUE_CONCURRENCY override', { concurrency: parsed });
                return parsed;
            }
        }

        // Get number of CPU cores available
        const cpuCores = os.cpus().length;

        // Calculate CPU-based concurrency (2 jobs per core is typical for I/O-bound work)
        const cpuBasedConcurrency = cpuCores * 2;

        // Calculate DB pool-based concurrency
        // We have 2 queues, so split DB pool connections between them
        // Reserve 50% of pool for web requests, divide remaining among queues
        const numQueues = 2;
        const reservedForWeb = Math.floor(QueueService.DB_POOL_SIZE * 0.5);
        const poolForQueues = QueueService.DB_POOL_SIZE - reservedForWeb;
        const dbBasedConcurrency = Math.floor(poolForQueues / numQueues);

        // Take the minimum to avoid overloading either resource
        const optimal = Math.min(cpuBasedConcurrency, dbBasedConcurrency);

        // Ensure at least 1 concurrent job
        const finalConcurrency = Math.max(1, optimal);

        log.debug('Calculated optimal queue concurrency', {
            cpuCores,
            cpuBasedConcurrency,
            dbPoolSize: QueueService.DB_POOL_SIZE,
            dbBasedConcurrency,
            finalConcurrency,
        });

        return finalConcurrency;
    }

    /**
     * @description Setup event listeners for queue monitoring and debugging.
     * Placeholder for future queue event monitoring.
     * @returns {void}
     */
    private setupQueueEventListeners(): void {
        // Implementation for queue event listeners
    }

    /**
     * @description Get the singleton instance of QueueService.
     * Creates a new instance if one does not exist (lazy initialization).
     * @returns {QueueService} The singleton QueueService instance
     */
    public static getInstance(): QueueService {
        // Check if singleton instance already exists
        if (!QueueService.instance) {
            // Create new instance on first access (lazy initialization)
            QueueService.instance = new QueueService();
        }
        // Return the singleton instance
        return QueueService.instance;
    }

    /**
     * @description Gracefully close queue connections and release resources.
     * Placeholder for cleanup logic (e.g., closing Redis connections).
     * @returns {Promise<void>}
     */
    public async close(): Promise<void> {
        // Implementation for graceful shutdown
    }
}

/** Singleton instance of the queue service */
export const queueService = QueueService.getInstance();
