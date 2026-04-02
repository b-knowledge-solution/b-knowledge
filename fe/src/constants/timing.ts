/**
 * @description Polling interval and cache timing constants (in milliseconds)
 */

/** Polling intervals for status checks */
export const PollInterval = {
  /** Fast polling for actively running processes (3s) */
  FAST: 3_000,
  /** Standard polling for document/job status (5s) */
  STANDARD: 5_000,
  /** Job management polling (10s) */
  JOB: 10_000,
  /** Conversion status polling (15s) */
  CONVERSION: 15_000,
  /** Default dataset/document list refresh (30s) */
  DEFAULT: 30_000,
  /** System monitor metrics refresh (5m) */
  SYSTEM_MONITOR: 300_000,
} as const

/** TanStack Query cache/stale times */
export const CacheTime = {
  /** Auth data stale time (5 minutes) */
  AUTH: 5 * 60 * 1_000,
  /** Dashboard data stale time (5 minutes) */
  DASHBOARD: 5 * 60 * 1_000,
} as const
