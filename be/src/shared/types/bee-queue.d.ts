/**
 * @fileoverview Type declarations for the bee-queue Redis-backed job queue library.
 *
 * bee-queue does not ship its own TypeScript definitions. This ambient module
 * declaration provides type safety for queue creation, job lifecycle, and
 * event handling used by the backend's background task system.
 *
 * @module types/bee-queue
 */
declare module 'bee-queue' {
  import { EventEmitter } from 'events';
  import { RedisClientType } from 'redis';

  /**
   * @description Configuration options for creating a new bee-queue instance.
   */
  interface QueueSettings {
    /** Redis key prefix for namespacing queues */
    prefix?: string;
    /** Interval in ms to check for stalled jobs */
    stallInterval?: number;
    /** Window in ms for near-term delayed job activation */
    nearTermWindow?: number;
    /** Debounce in ms for delayed job processing */
    delayedDebounce?: number;
    /** Redis connection config: object, URL string, or existing client */
    redis?: {
      host?: string;
      port?: number;
      db?: number;
      options?: any;
      password?: string;
    } | string | RedisClientType;
    /** Whether this instance processes jobs (default: true) */
    isWorker?: boolean;
    /** Whether to subscribe to job events via Redis pub/sub */
    getEvents?: boolean;
    /** Whether to publish job events via Redis pub/sub */
    sendEvents?: boolean;
    /** Whether to persist job data in Redis */
    storeJobs?: boolean;
    /** Whether to ensure Lua scripts are loaded */
    ensureScripts?: boolean;
    /** Whether to activate delayed jobs on this instance */
    activateDelayedJobs?: boolean;
    /** Automatically remove jobs from Redis on success */
    removeOnSuccess?: boolean;
    /** Automatically remove jobs from Redis on failure */
    removeOnFailure?: boolean;
    /** SCAN count for Redis iteration */
    redisScanCount?: number;
  }

  /**
   * @description Represents a single job in the queue with its data and lifecycle methods.
   * @template T - The type of the job's data payload
   */
  interface Job<T = any> extends EventEmitter {
    /** Unique job identifier */
    id: string;
    /** Job payload data */
    data: T;
    /** Internal job options */
    options: any;
    /** Reference to the parent queue */
    queue: Queue;
    /** Current progress value */
    progress: any;

    /** Set a custom job ID */
    setId(id: string): this;
    /** Set number of retry attempts on failure */
    retries(n: number): this;
    /** Configure backoff strategy for retries */
    backoff(strategy: string, delayFactor?: number): this;
    /** Delay job processing until the given date or timestamp */
    delayUntil(dateOrTimestamp: Date | number): this;
    /** Set maximum processing time in milliseconds */
    timeout(ms: number): this;
    /** Save the job to the queue for processing */
    save(cb?: (err: Error | null, job: Job<T>) => void): Promise<Job<T>>;
    /** Report job progress (0-100 or custom value) */
    reportProgress(n: any): void;
    /** Remove the job from the queue */
    remove(cb?: (err: Error | null) => void): Promise<Job<T>>;
    /** Listen for job lifecycle events */
    on(event: string, handler: (...args: any[]) => void): this;
  }

  /**
   * @description Redis-backed job queue with support for concurrency, retries, and events.
   */
  class Queue extends EventEmitter {
    /**
     * @description Create a new queue instance.
     * @param {string} name - Queue name (used as Redis key namespace)
     * @param {QueueSettings} settings - Optional queue configuration
     */
    constructor(name: string, settings?: QueueSettings);

    /** Queue name */
    name: string;
    /** Redis key prefix */
    keyPrefix: string;
    /** Map of active jobs */
    jobs: Map<string, Job>;
    /** Whether the queue is currently paused */
    paused: boolean;
    /** Current queue settings */
    settings: QueueSettings;

    /** Create a new job with the given data payload */
    createJob<T>(data: T): Job<T>;
    /** Retrieve a job by its ID */
    getJob(jobId: string, cb?: (err: Error | null, job: Job) => void): Promise<Job>;
    /** Retrieve jobs by type (waiting, active, succeeded, failed) */
    getJobs(type: string, page: any, cb?: (err: Error | null, jobs: Job[]) => void): Promise<Job[]>;
    /** Register a job processing handler */
    process<T>(handler: (job: Job<T>, done: (err?: Error | null, result?: any) => void) => Promise<any> | void): void;
    /** Register a job processing handler with concurrency limit */
    process<T>(concurrency: number, handler: (job: Job<T>, done: (err?: Error | null, result?: any) => void) => Promise<any> | void): void;
    /** Check for and re-queue stalled jobs */
    checkStalledJobs(interval?: number, cb?: (err: Error | null, numStalled: number) => void): Promise<number>;
    /** Get queue health statistics (waiting, active, succeeded, failed counts) */
    checkHealth(cb?: (err: Error | null, counts: any) => void): Promise<any>;
    /** Gracefully close the queue and its Redis connections */
    close(timeout?: number, cb?: (err: Error | null) => void): Promise<void>;
    /** Check if the queue is currently processing jobs */
    isRunning(): boolean;
    /** Wait for the queue to be ready (Redis connected, scripts loaded) */
    ready(cb?: (err: Error | null) => void): Promise<void>;
    /** Remove a specific job by ID */
    removeJob(jobId: string, cb?: (err: Error | null) => void): Promise<void>;
    /** Destroy the queue and remove all Redis keys */
    destroy(cb?: (err: Error | null) => void): Promise<void>;
  }

  export = Queue;
}
