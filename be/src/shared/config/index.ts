/**
 * @fileoverview Centralized configuration module for the Knowledge Base backend.
 * 
 * This module provides type-safe access to all application configuration values.
 * Configuration is loaded from environment variables with sensible defaults.
 * 
 * Key features:
 * - All environment variables accessed through the `config` object (never raw process.env)
 * - Production-mode validation for required secrets
 * - Lazy-loading of SSL certificates to avoid startup errors
 * - Type safety with TypeScript's `as const` assertion
 * 
 * @module config
 * @example
 * import { config } from './config/index.js';
 * console.log(config.port); // 3001
 * console.log(config.database.type); // 'postgresql' or 'sqlite'
 */

import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/** ESM-compatible __filename resolution */
const __filename = fileURLToPath(import.meta.url);
/** ESM-compatible __dirname resolution */
const __dirname = dirname(__filename);

/** Load environment variables from .env file */
dotenv.config();

// ============================================================================
// SSL CERTIFICATE CONFIGURATION
// ============================================================================

/** Path to SSL certificates directory (relative to project root) */
const certsDir = join(__dirname, '..', '..', '..', 'certs');
/** Path to SSL private key file */
const sslKeyPath = join(certsDir, 'key.pem');
/** Path to SSL certificate file */
const sslCertPath = join(certsDir, 'cert.pem');

/** Whether SSL certificates exist and can be loaded */
const hasSSLCerts = existsSync(sslKeyPath) && existsSync(sslCertPath);

/** Current Node.js environment (development/production/test) */
const nodeEnv = process.env['NODE_ENV'] ?? 'development';
/** Whether running in production mode */
const isProduction = nodeEnv === 'production';

// ============================================================================
// ENVIRONMENT VARIABLE HELPERS
// ============================================================================

/**
 * @description Safely retrieves an environment variable with production validation.
 * In production, throws if a required variable (no default) is missing.
 * In development, returns empty string for missing required variables.
 * @param {string} key - The environment variable name to retrieve
 * @param {string} defaultValue - Optional default value if not set
 * @returns {string} The environment variable value, default value, or empty string
 * @throws {Error} In production if required variable is missing (no default provided)
 * 
 * @example
 * // Required in production, optional in development
 * const secret = getEnv('API_SECRET');
 * 
 * // With default value (never throws)
 * const port = getEnv('PORT', '3001');
 */
const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    if (isProduction) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return ''; // Return empty string in dev if not required
  }
  return value;
};

// ============================================================================
// MAIN CONFIGURATION OBJECT
// ============================================================================

/**
 * @description Application configuration object.
 * Provides centralized, type-safe access to all configuration values.
 *
 * @remarks
 * This object is frozen with `as const` to ensure immutability.
 * Access environment variables through this object instead of process.env directly.
 * 
 * @property {number} port - Server listening port (default: 3001)
 * @property {string} nodeEnv - Current environment (development/production/test)
 * @property {boolean} isProduction - Quick check for production mode
 * @property {object} https - HTTPS/SSL configuration
 * @property {object} database - Database connection settings
 * @property {object} ragflow - RAGFlow iframe URLs and sources
 * @property {object} langfuse - Langfuse observability configuration
 * @property {object} azureAd - Azure Entra ID OAuth settings
 * @property {object} redis - Redis connection settings
 * @property {object} session - Session management settings
 */
export const config = {
  /** Server port number */
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  /** Current Node environment */
  nodeEnv,
  /** Production mode flag */
  isProduction,

  /** Root user configuration */
  rootUser: process.env['KB_ROOT_USER'] || 'admin@localhost',
  rootPassword: process.env['KB_ROOT_PASSWORD'] || 'admin',

  /** Test password for sample users (development/testing only) */
  testPassword: process.env['TEST_PASSWORD'] || '',

  /** Base URL for Knowledge Base documents */
  kbBaseUrl: process.env['KB_BASE_URL'] || '',

  /**
   * Whether to ignore self-signed SSL certificates.
   * WARNING: This makes the application insecure and should only be used in development/testing.
   */
  ignoreSelfSignedCerts: process.env['IGNORE_SELF_SIGNED_CERTS'] === 'true',

  // --------------------------------------------------------------------------
  // HTTPS/SSL Configuration
  // --------------------------------------------------------------------------

  /**
   * HTTPS configuration settings.
   * Enables secure connections when SSL certificates are available.
   */
  https: {
    /** Whether HTTPS is enabled (requires certificates) */
    enabled: process.env['HTTPS_ENABLED'] === 'true' && hasSSLCerts,
    /** Path to SSL private key file */
    keyPath: sslKeyPath,
    /** Path to SSL certificate file */
    certPath: sslCertPath,
    /**
     * Lazily loads SSL credentials.
     * Returns null if certificates don't exist.
     * @returns SSL key/cert pair or null
     */
    getCredentials: () => hasSSLCerts ? {
      key: readFileSync(sslKeyPath),
      cert: readFileSync(sslCertPath),
    } : null,
  },

  // --------------------------------------------------------------------------
  // Development Configuration
  // --------------------------------------------------------------------------

  /** Development domain for local URLs (default: localhost) */
  devDomain: process.env['DEV_DOMAIN'] ?? 'localhost',

  // --------------------------------------------------------------------------
  // Feature Flags
  // --------------------------------------------------------------------------

  /** Enable local user login (username/password auth) */
  enableLocalLogin: process.env['ENABLE_LOCAL_LOGIN'] === 'true',

  // --------------------------------------------------------------------------
  // Session Store Configuration
  // --------------------------------------------------------------------------

  /**
   * Session storage configuration.
   * Uses Redis in production for persistence, memory in development.
   */
  sessionStore: {
    /** Session store type: 'redis' for production, 'memory' for development */
    type: (process.env['SESSION_STORE'] ||
      (isProduction ? 'redis' : 'memory')) as 'redis' | 'memory',
  },

  // --------------------------------------------------------------------------
  // Database Configuration
  // --------------------------------------------------------------------------

  /**
   * PostgreSQL database connection configuration.
   */
  database: {
    /** PostgreSQL host address */
    host: process.env['DB_HOST'] ?? 'localhost',
    /** PostgreSQL port number */
    port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
    /** PostgreSQL database name */
    name: process.env['DB_NAME'] ?? 'knowledge_base',
    /** PostgreSQL username */
    user: process.env['DB_USER'] ?? 'postgres',
    /** PostgreSQL password */
    password: process.env['DB_PASSWORD'] ?? '',
  },

  // --------------------------------------------------------------------------
  // RAGFlow Integration Configuration
  // --------------------------------------------------------------------------

  /**
   * Path to RAGFlow configuration file.
   * Can be customized via environment variable for Docker volume mounts.
   * Default: undefined (uses built-in config path)
   * 
   * Config is loaded from JSON file (see ragflow.config.json)
   */
  ragflowConfigPath: process.env['RAGFLOW_CONFIG_PATH'] ?? undefined,

  // --------------------------------------------------------------------------
  // Langfuse Observability Configuration
  // --------------------------------------------------------------------------

  /**
   * Langfuse configuration for LLM observability and tracing.
   * Used to log chat/search interactions for analytics and debugging.
   */
  langfuse: {
    /** Langfuse secret key for server-side operations */
    secretKey: process.env['LANGFUSE_SECRET_KEY'] ?? '',
    /** Langfuse public key for client identification */
    publicKey: process.env['LANGFUSE_PUBLIC_KEY'] ?? '',
    /** Langfuse API base URL (self-hosted or cloud) */
    baseUrl: process.env['LANGFUSE_BASE_URL'] ?? 'https://cloud.langfuse.com',
  },

  // --------------------------------------------------------------------------
  // Azure Entra ID (Azure AD) Configuration
  // --------------------------------------------------------------------------

  /**
   * Azure Entra ID OAuth 2.0 configuration.
   * Handles user authentication via Microsoft identity platform.
   */
  azureAd: {
    /** Azure AD Application (client) ID */
    clientId: getEnv('AZURE_AD_CLIENT_ID', ''),
    /** Azure AD Client secret for confidential client auth */
    clientSecret: getEnv('AZURE_AD_CLIENT_SECRET', ''),
    /** Azure AD Tenant (directory) ID */
    tenantId: getEnv('AZURE_AD_TENANT_ID', ''),
    /** OAuth callback URL (must match Azure Portal configuration) */
    redirectUri: process.env['AZURE_AD_REDIRECT_URI'] ?? 'http://localhost:3001/api/auth/callback',
    /** Optional proxy URL for Azure AD requests */
    proxyUrl: process.env['AZURE_AD_PROXY_URL'] ?? undefined,
  },

  // --------------------------------------------------------------------------
  // Redis Configuration
  // --------------------------------------------------------------------------

  /**
   * Redis connection configuration for session storage.
   * Redis provides persistent sessions across server restarts.
   */
  redis: {
    /** Redis server hostname */
    host: process.env['REDIS_HOST'] ?? 'localhost',
    /** Redis server port */
    port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    /** Redis authentication password (optional) */
    password: process.env['REDIS_PASSWORD'] ?? undefined,
    /** Redis database number (0-15) */
    db: parseInt(process.env['REDIS_DB'] ?? '0', 10),
    /**
     * Constructs Redis connection URL from individual settings.
     * Format: redis://[:password@]host:port/db
     */
    get url(): string {
      const password = process.env['REDIS_PASSWORD'];
      const host = process.env['REDIS_HOST'] ?? 'localhost';
      const port = process.env['REDIS_PORT'] ?? '6379';
      const db = process.env['REDIS_DB'] ?? '0';
      return password
        ? `redis://:${password}@${host}:${port}/${db}`
        : `redis://${host}:${port}/${db}`;
    },
  },

  // --------------------------------------------------------------------------
  // Session Configuration
  // --------------------------------------------------------------------------

  /**
   * Session management settings.
   * Controls session security and lifetime.
   */
  session: {
    /** Secret for signing session ID cookies (required in production) */
    secret: getEnv('SESSION_SECRET', isProduction ? undefined : 'change-me-in-production'),
    /** Session time-to-live in seconds (default: 7 days) */
    ttlSeconds: parseInt(process.env['SESSION_TTL_DAYS'] ?? '7', 10) * 24 * 60 * 60,
  },

  // --------------------------------------------------------------------------
  // Frontend Configuration
  // --------------------------------------------------------------------------

  /** Frontend application URL for CORS and redirects */
  frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:5173',

  /**
   * Shared storage domain for cross-subdomain user info sharing.
   * Set to parent domain (e.g., '.example.com') for subdomain session sharing.
   */
  sharedStorageDomain: process.env['SHARED_STORAGE_DOMAIN'] ?? '.localhost',

  // --------------------------------------------------------------------------
  // CORS Configuration
  // --------------------------------------------------------------------------

  /**
   * CORS configuration for external API access.
   * Allows multiple origins for cross-origin requests.
   */
  cors: {
    /**
     * Allowed origins for CORS requests.
     * Set via CORS_ORIGINS environment variable as comma-separated list.
     * Special value '*' allows all origins (use with caution in production).
     * Falls back to FRONTEND_URL if not set.
     * Example: "http://localhost:5173,https://app.example.com,https://api.example.com"
     */
    origins: (() => {
      const corsOrigins = process.env['CORS_ORIGINS'];
      if (!corsOrigins) {
        return [process.env['FRONTEND_URL'] ?? 'http://localhost:5173'];
      }
      if (corsOrigins === '*') {
        return '*' as const;
      }
      return corsOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
    })(),
    /** Allow credentials (cookies, authorization headers) in CORS requests */
    credentials: process.env['CORS_CREDENTIALS'] !== 'false',
  },

  // --------------------------------------------------------------------------
  // Cache Configuration
  // --------------------------------------------------------------------------

  /** 
   * Path to temporary cache directory for file previews.
   * Default: './temp' relative to CWD
   */
  tempCachePath: process.env['TEMP_CACHE_PATH'] ?? './temp',

  /**
   * TTL for cached temp files in milliseconds.
   * Default: 7 days
   */
  tempFileTTL: parseInt(process.env['TEMP_FILE_TTL_MS'] ?? '604800000', 10), // 7 days in ms

  /**
   * Cron schedule for temp file cleanup.
   * Default: '0 0 * * *' (Every day at midnight)
   */
  tempFileCleanupSchedule: process.env['TEMP_FILE_CLEANUP_SCHEDULE'] ?? '0 0 * * *',

  /**
   * Centralized log directory.
   * When set, all log files are written to this directory with a 'backend-' prefix.
   * When empty, falls back to '<cwd>/logs'.
   */
  logDir: process.env['LOG_DIR'] ?? '',

  // --------------------------------------------------------------------------
  // System Tools Configuration
  // --------------------------------------------------------------------------

  /**
   * Path to system tools configuration file.
   * Can be customized via environment variable for Docker volume mounts.
   * Default: undefined (uses built-in config path)
   */
  systemToolsConfigPath: process.env['SYSTEM_TOOLS_CONFIG_PATH'] ?? undefined,

  // --------------------------------------------------------------------------
  // External Trace API Configuration
  // --------------------------------------------------------------------------

  /**
   * External trace API configuration.
   * Allows external systems to submit trace data for Langfuse tracing.
   */
  externalTrace: {
    /** Enable/disable external trace API */
    enabled: process.env['EXTERNAL_TRACE_ENABLED'] === 'true',
    /** API key for external system authentication (optional) */
    apiKey: process.env['EXTERNAL_TRACE_API_KEY'] ?? '',
    /** Cache TTL for email validation in seconds (default: 5 minutes) */
    cacheTtlSeconds: parseInt(process.env['EXTERNAL_TRACE_CACHE_TTL'] ?? '300', 10),
    /** Lock timeout for preventing race conditions in milliseconds */
    lockTimeoutMs: parseInt(process.env['EXTERNAL_TRACE_LOCK_TIMEOUT'] ?? '5000', 10),
  },

  // --------------------------------------------------------------------------
  // WebSocket Configuration
  // --------------------------------------------------------------------------

  /**
   * WebSocket (Socket.IO) configuration.
   * Enables real-time notifications for Python clients and web browsers.
   */
  // --------------------------------------------------------------------------
  // S3-Compatible Storage Configuration
  // --------------------------------------------------------------------------

  /**
   * S3-compatible object storage configuration (RustFS / MinIO / etc.).
   * Bucket name must match advance-rag/conf/service_conf.yaml s3.bucket.
   */
  s3: {
    /** S3-compatible endpoint hostname */
    endpoint: process.env['S3_ENDPOINT'] ?? 'localhost',
    /** S3-compatible endpoint port */
    port: parseInt(process.env['S3_PORT'] ?? '9000', 10),
    /** S3 access key */
    accessKey: process.env['S3_ACCESS_KEY'] ?? '',
    /** S3 secret key */
    secretKey: process.env['S3_SECRET_KEY'] ?? '',
    /** Whether to use SSL for S3 connections */
    useSSL: process.env['S3_USE_SSL'] === 'true',
    /** S3 bucket name for document storage (must match RAG worker config) */
    bucket: process.env['S3_BUCKET'] ?? 'knowledge',
    /** Optional prefix path within the bucket (must match RAG worker config) */
    prefixPath: process.env['S3_PREFIX_PATH'] ?? '',
  },

  // --------------------------------------------------------------------------
  // OpenSearch / VectorDB Configuration
  // --------------------------------------------------------------------------

  /** OpenSearch / VectorDB configuration */
  opensearch: {
    host: process.env['VECTORDB_HOST'] || process.env['ES_HOST'] || 'http://localhost:9200',
    password: process.env['VECTORDB_PASSWORD'] || process.env['ES_PASSWORD'] || '',
    systemTenantId: (process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001').replace(/-/g, ''),
  },

  // --------------------------------------------------------------------------
  // Memgraph Configuration (Code Knowledge Graph)
  // --------------------------------------------------------------------------

  /**
   * Memgraph graph database configuration.
   * Used for storing and querying code knowledge graphs via Bolt protocol.
   */
  memgraph: {
    /** Bolt protocol URL for Memgraph connection */
    boltUrl: process.env['MEMGRAPH_BOLT_URL'] ?? 'bolt://localhost:7687',
  },

  // --------------------------------------------------------------------------
  // WebSocket Configuration
  // --------------------------------------------------------------------------

  websocket: {
    /** Enable/disable WebSocket server */
    enabled: process.env['WEBSOCKET_ENABLED'] !== 'false',
    /** API key for external client authentication (optional, if empty no API key validation) */
    apiKey: process.env['WEBSOCKET_API_KEY'] ?? '',
    /** CORS origin for WebSocket connections */
    corsOrigin: process.env['WEBSOCKET_CORS_ORIGIN'] ?? process.env['FRONTEND_URL'] ?? 'http://localhost:5173',
    /** Ping timeout in milliseconds */
    pingTimeout: parseInt(process.env['WEBSOCKET_PING_TIMEOUT'] ?? '60000', 10),
    /** Ping interval in milliseconds */
    pingInterval: parseInt(process.env['WEBSOCKET_PING_INTERVAL'] ?? '25000', 10),
  },
} as const;

/**
 * @description Type definition derived from the configuration object.
 * Useful for function parameters that need config type hints.
 */
export type Config = typeof config;

