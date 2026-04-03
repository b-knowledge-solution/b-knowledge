/**
 * @fileoverview Non-blocking query logging service for analytics and observability.
 * @description Fire-and-forget query event recording that never blocks the caller.
 *   Uses void promise pattern to ensure query logging failures are silently logged
 *   without propagating errors to the request pipeline.
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * @description Data required to log a query event. Mirrors query_log table columns.
 */
export interface CreateQueryLogData {
  /** Source of the query: 'chat' or 'search' */
  source: 'chat' | 'search'
  /** conversation_id for chat, search_app_id for search */
  source_id: string
  /** UUID of the user who issued the query */
  user_id: string
  /** Tenant ID for multi-org isolation */
  tenant_id: string
  /** Original query text */
  query: string
  /** Dataset IDs that were searched */
  dataset_ids?: string[]
  /** Number of results returned */
  result_count?: number
  /** End-to-end response time in milliseconds */
  response_time_ms?: number
  /** Average confidence/relevance score */
  confidence_score?: number
  /** Whether retrieval returned zero or below-threshold results */
  failed_retrieval?: boolean
}

/**
 * @description Service for asynchronous query logging. All methods are fire-and-forget
 *   to ensure query logging never blocks the main request pipeline.
 */
class QueryLogService {
  /**
   * @description Log a query event asynchronously without blocking the caller.
   *   Uses void promise pattern -- errors are caught and logged as warnings,
   *   never propagated to the caller.
   * @param {CreateQueryLogData} data - Query event data to record
   * @returns {void} Returns immediately; insert happens in background
   */
  logQuery(data: CreateQueryLogData): void {
    // Fire-and-forget: never await, never throw to caller
    void ModelFactory.queryLog.create({
      source: data.source,
      source_id: data.source_id,
      user_id: data.user_id,
      tenant_id: data.tenant_id,
      query: data.query,
      dataset_ids: JSON.stringify(data.dataset_ids ?? []) as any,
      result_count: data.result_count ?? 0,
      response_time_ms: data.response_time_ms ?? null,
      confidence_score: data.confidence_score ?? null,
      failed_retrieval: data.failed_retrieval ?? false,
    } as any).catch((err: unknown) => {
      // Non-blocking: log warning but never fail the request
      log.warn('Failed to log query event', { error: String(err), source: data.source })
    })
  }
}

/** Singleton instance */
export const queryLogService = new QueryLogService()
