/**
 * @fileoverview Redis service for session storage and caching.
 * 
 * This module manages the Redis client connection.
 * It provides a singleton client instance and helper methods
 * for checking connection status.
 * 
 * @module services/redis
 */

import { createClient } from 'redis';
import { config } from '@/shared/config/index.js';
import { log } from '@/shared/services/logger.service.js';

/** @description Redis client type alias derived from the createClient return type */
export type RedisClient = ReturnType<typeof createClient>;

/** Singleton Redis client instance */
let redisClient: RedisClient | null = null;

/**
 * @description Initialize the Redis client if configured.
 * Creates client, sets up event listeners, and attempts connection.
 * Skips initialization when session store is not set to 'redis'.
 * @returns {Promise<RedisClient | null>} Redis client instance or null if not configured
 */
export async function initRedis(): Promise<RedisClient | null> {
    // Skip Redis initialization if session store is not configured as Redis
    if (config.sessionStore.type !== 'redis') {
        log.info('Redis not configured (using memory store)');
        return null;
    }

    // Return existing client if already initialized
    if (redisClient) {
        return redisClient;
    }

    log.info('Initializing Redis client...', { url: config.redis.url.replace(/:[^:@]*@/, ':***@') });

    redisClient = createClient({
        url: config.redis.url,
    });

    // Redis event handlers for connection lifecycle logging
    redisClient.on('error', (err) => {
        log.error('Redis client error', { error: err.message });
    });

    redisClient.on('connect', () => {
        log.debug('Redis client connected');
    });

    redisClient.on('ready', () => {
        log.info('Redis client ready');
    });

    redisClient.on('reconnecting', () => {
        log.warn('Redis client reconnecting');
    });

    // Connect to Redis
    try {
        await redisClient.connect();
    } catch (error) {
        log.error('Failed to connect to Redis', {
            error: error instanceof Error ? error.message : String(error)
        });
        // We don't throw here to allow app to start even if Redis fails (if session store handles it)
        // But usually session store will fail if client is not connected.
    }

    return redisClient;
}

/**
 * @description Get the initialized Redis client.
 * @returns {RedisClient | null} Redis client instance or null if not initialized
 */
export function getRedisClient(): RedisClient | null {
    return redisClient;
}

/**
 * @description Gracefully shutdown the Redis client and release the connection.
 * @returns {Promise<void>}
 */
export async function shutdownRedis(): Promise<void> {
    if (redisClient && redisClient.isOpen) {
        await redisClient.quit(); // Graceful shutdown
        log.info('Redis client disconnected');
        redisClient = null;
    }
}

/**
 * @description Get Redis connection status for health checks.
 * @returns {'connected' | 'connecting' | 'disconnected' | 'not_initialized' | 'not_configured'} Current connection state
 */
export function getRedisStatus(): 'connected' | 'connecting' | 'disconnected' | 'not_initialized' | 'not_configured' {
    // Redis is not configured as the session store
    if (config.sessionStore.type !== 'redis') {
        return 'not_configured';
    }
    // Client has not been created yet
    if (!redisClient) {
        return 'not_initialized';
    }
    // Client is fully ready to accept commands
    if (redisClient.isReady) {
        return 'connected';
    }
    // Client has an open socket but may still be authenticating
    if (redisClient.isOpen) {
        return 'connecting';
    }
    return 'disconnected';
}
