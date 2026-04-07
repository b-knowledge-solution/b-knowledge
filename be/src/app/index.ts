
/**
 * @fileoverview Application entrypoint: configures middleware, routes, background jobs,
 * and graceful shutdown.
 *
 * This module is the main Express server bootstrap. It initializes Redis,
 * sets up security middleware (Helmet, CORS, sessions), registers API routes,
 * runs database migrations on boot, and wires up graceful shutdown handlers.
 *
 * Keep all environment access through `config` to preserve centralized validation.
 *
 * @module app/index
 */
import express from 'express';
import session from 'express-session';
import { RedisStore } from 'connect-redis'; // Fixed named import
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import * as http from 'http';
import * as https from 'https';

import { config } from '@/shared/config/index.js';
import { log } from '@/shared/services/logger.service.js';
import { initRedis, getRedisClient, shutdownRedis } from '@/shared/services/redis.service.js';
import { db, getAdapter, checkConnection, closePool } from '@/shared/db/index.js';
// import { runMigrations } from '@/shared/db/migrations/runner.js'; // Deprecated/Removed
import knex from 'knex';
import dbConfig from '@/shared/db/knexfile.js';
import { cronService } from '@/shared/services/cron.service.js';

import { systemToolsService } from '@/modules/system-tools/system-tools.service.js';
import { userService } from '@/modules/users/index.js';
import { llmProviderService } from '@/modules/llm-provider/index.js';
import { shutdownLangfuse } from '@/shared/services/langfuse.service.js';

import { socketService } from '@/shared/services/socket.service.js';

import { setupApiRoutes } from '@/app/routes.js';
import { syncSchedulerService } from '@/modules/sync/index.js';
import { syncPermissionsCatalog } from '@/shared/permissions/sync.js';
import { rolePermissionCacheService } from '@/shared/services/role-permission-cache.service.js';

/**
 * @description Express application instance shared across the module.
 * Exported for test access and route registration.
 */
const app = express();
let startupReady = false

// Initialize Redis before any middleware that relies on it (sessions, rate limiting storage)
await initRedis();
const redisClient = getRedisClient();

app.set('trust proxy', 1);

// Harden basic security headers; CSP is relaxed only where absolutely required for the iframe use case
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      frameAncestors: ["'self'", config.frontendUrl],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", config.frontendUrl, "wss:", "ws:"],
    },
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS is restricted to the configured frontend to keep cookies/sessions scoped
app.use(cors({
  origin: config.cors.origins,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session cookies are the primary auth mechanism (Azure AD-backed); Redis store is used when configured
const sessionConfig: session.SessionOptions = {
  store: config.sessionStore.type === 'redis' && redisClient
    ? new RedisStore({ client: redisClient, prefix: 'sess:' })
    : undefined,
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  name: 'sid',
  cookie: {
    secure: config.https.enabled,
    httpOnly: true,
    maxAge: config.session.ttlSeconds * 1000,
    sameSite: 'lax',
    domain: config.isProduction ? config.sharedStorageDomain : undefined,
  },
};

app.use(session(sessionConfig));

// Setup all API routes and middleware
setupApiRoutes(app, {
  isReady: () => startupReady,
});

// Initialize sync scheduler for connectors with cron schedules (runs after DB is ready)
// Deferred to after migrations complete in startServer()


/**
 * @description Bootstraps the HTTP/HTTPS server and initializes background services
 * (Socket.IO, cron, migrations, root user) that require the listener to be active.
 * @returns {Promise<http.Server | https.Server>} The started server instance
 */
const startServer = async (): Promise<http.Server | https.Server> => {
  let server: http.Server | https.Server;
  const protocol = config.https.enabled ? 'https' : 'http';

  // Create HTTPS server if enabled and certs available, otherwise fall back to HTTP
  if (config.https.enabled) {
    const credentials = config.https.getCredentials();
    if (credentials) {
      server = https.createServer(credentials, app);
      log.warn('HTTPS enabled with SSL certificates');
    } else {
      log.warn('HTTPS enabled but certificates not found, falling back to HTTP');
      server = http.createServer(app);
    }
  } else {
    server = http.createServer(app);
  }

  // Initialize Socket.IO with the server
  if (config.websocket.enabled) {
    socketService.initialize(server);
  }

  // Allow long-running requests (e.g. file uploads, RAG processing) up to 30 minutes
  server.setTimeout(30 * 60 * 1000);

  if (await checkConnection()) {
    log.info('Database connected successfully');

    // Keep schema aligned on boot before accepting any traffic.
    try {
      log.info('Running Knex migrations...');
      const k = knex(dbConfig);
      await k.migrate.latest();
      await k.destroy();
      log.info('Knex migrations completed successfully');
    } catch (error) {
      log.error('Failed to run migrations', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        details: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      process.exit(1);
    }

    // Reconcile the permission catalog with the in-code registry. MUST run
    // after migrations (so the `permissions` table exists) and before the
    // root-user bootstrap. Phase 1 keeps the legacy `rbac.ts` shim as the
    // active auth path, so a sync failure here is logged but MUST NOT take
    // the server down — wrap in try/catch and continue startup.
    try {
      const syncResult = await syncPermissionsCatalog();
      log.info('[boot] permission catalog synced', { ...syncResult });
    } catch (syncErr) {
      log.error('[boot] permission catalog sync failed — continuing startup', {
        error: syncErr instanceof Error ? syncErr.message : String(syncErr),
      });
    }

    // Load the role_permissions snapshot into the in-process cache. This
    // populates `RolePermissionCacheService` so the legacy `hasPermission`
    // shim at `rbac.ts` can answer queries synchronously from the DB-backed
    // source of truth instead of the hardcoded ROLE_PERMISSIONS map.
    try {
      await rolePermissionCacheService.loadAll();
    } catch (err) {
      log.error('[boot] role permission cache load failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      // Non-fatal — the legacy shim will return false for all queries
      // until a subsequent refresh succeeds. The new V2 path does not
      // depend on this cache, so the app continues to function.
    }

    // Ensure a bootstrap admin exists even on fresh databases.
    await userService.initializeRootUser();

    // Auto-seed system embedding provider when LOCAL_EMBEDDING_ENABLE=true (per D-07).
    try {
      await llmProviderService.seedSystemEmbeddingProvider()
    } catch (err) {
      log.error('Failed to seed system embedding provider', { error: err })
    }

    // Initialize background services only after the schema exists.
    await systemToolsService.initialize();
    cronService.startCleanupJob();
    await cronService.initParsingSchedulerFromConfig();
    await syncSchedulerService.init();

    // Mark the process ready only after schema migrations and bootstrap data
    // are fully available for dependent workers and API consumers.
    startupReady = true
    log.info('Backend startup readiness complete')
  } else {
    log.warn('Database connection failed');
  }

  await new Promise<void>((resolve) => {
    server.listen(config.port, () => {
      log.info(`Backend server started`, {
        url: `${protocol}://${config.devDomain}:${config.port}`,
        environment: config.nodeEnv,
        https: config.https.enabled,
        websocket: config.websocket.enabled,
        sessionTTL: `${config.session.ttlSeconds / 86400} days`,
      });
      resolve();
    });
  })

  return server;
};

// Force crash on unexpected sync exceptions to avoid undefined state
process.on('uncaughtException', (err: Error) => {
  log.error('Uncaught Exception - shutting down', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// Log unhandled promise rejections; keep process alive to allow graceful shutdown hooks
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  log.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Skip server startup in test environments to allow Vitest to control the lifecycle
const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;
if (!isTest) {
  startServer().then((server) => {
    const shutdown = async () => {
      log.info('Shutting down server...');
      server.close(() => {
        log.info('HTTP server closed');
      });
      await shutdownRedis();
      await closePool();
      await shutdownLangfuse();

      await socketService.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }).catch((err) => {
    log.error('Failed to start server', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  });
}

export { app, startServer };
