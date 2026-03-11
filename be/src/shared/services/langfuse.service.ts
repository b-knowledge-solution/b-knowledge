/**
 * @fileoverview Langfuse observability service.
 *
 * This module provides integration with Langfuse for LLM observability.
 * Langfuse is used to trace and log AI chat/search interactions for
 * analytics, debugging, and monitoring purposes.
 *
 * Features:
 * - Singleton client pattern for efficient resource usage
 * - Lazy initialization to avoid startup errors if Langfuse is not configured
 * - Graceful shutdown to ensure all traces are flushed
 * - LangfuseTraceService for structured trace/span/generation creation
 *
 * @module services/langfuse
 * @see https://langfuse.com/docs
 */

import { Langfuse } from 'langfuse'
import type { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse'
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for creating a new Langfuse trace */
export interface CreateTraceParams {
  /** Descriptive name for the trace (e.g. 'chat-rag-pipeline') */
  name: string
  /** User identifier (email) */
  userId?: string | null
  /** Session identifier for grouping related traces */
  sessionId?: string | null
  /** Input data (user question, query, etc.) */
  input?: unknown
  /** Output data (final answer) */
  output?: unknown
  /** Arbitrary metadata */
  metadata?: Record<string, unknown> | null
  /** Tags for filtering */
  tags?: string[] | null
}

/** Parameters for creating a span under a trace or another span */
export interface CreateSpanParams {
  /** Descriptive name for the span (e.g. 'retrieval', 'reranking') */
  name: string
  /** Input data for this step */
  input?: unknown
  /** Output data for this step */
  output?: unknown
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>
}

/** Parameters for creating a generation (LLM call) */
export interface CreateGenerationParams {
  /** Descriptive name for the generation */
  name: string
  /** Input to the LLM (messages array or structured prompt) */
  input?: unknown
  /** Output from the LLM */
  output?: unknown
  /** Model identifier */
  model?: string
  /** Token usage statistics */
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null
  /** Arbitrary metadata */
  metadata?: Record<string, unknown> | null
}

/** Union type for trace or span — both can be parents of generations */
export type LangfuseParent = LangfuseTraceClient | LangfuseSpanClient

// ---------------------------------------------------------------------------
// Singleton Langfuse Client
// ---------------------------------------------------------------------------

/** Singleton Langfuse client instance */
let langfuseClient: Langfuse | null = null

/**
 * Get or create the Langfuse client instance.
 *
 * @returns Langfuse - Langfuse client instance.
 * @description Uses lazy initialization to create or return the singleton client.
 *
 * @example
 * const langfuse = getLangfuseClient();
 * const trace = langfuse.trace({ name: 'chat-interaction' });
 * trace.generation({ input: prompt, output: response });
 */
export function getLangfuseClient(): Langfuse {
  if (!langfuseClient) {
    log.debug('Initializing Langfuse client', { baseUrl: config.langfuse.baseUrl })
    // Initialize new client with config credentials
    langfuseClient = new Langfuse({
      secretKey: config.langfuse.secretKey,
      publicKey: config.langfuse.publicKey,
      baseUrl: config.langfuse.baseUrl,
    })
  }
  return langfuseClient
}

/**
 * Shutdown the Langfuse client gracefully.
 *
 * @returns Promise<void>
 * @description Flushes pending traces and shuts down the client.
 *
 * @example
 * // In graceful shutdown handler
 * await shutdownLangfuse();
 * process.exit(0);
 */
export async function shutdownLangfuse(): Promise<void> {
  if (langfuseClient) {
    log.info('Shutting down Langfuse client')
    // Ensure all events are sent before exit
    await langfuseClient.shutdownAsync()
    langfuseClient = null
  }
}

/**
 * Check connectivity to Langfuse server.
 *
 * @returns Promise<boolean> - True if connected/healthy, false otherwise.
 * @description Verifies configuration and attempts a dummy ingestion request to check health.
 */
export async function checkHealth(): Promise<boolean> {
  // Check for required configuration keys
  if (!config.langfuse.publicKey || !config.langfuse.secretKey || !config.langfuse.baseUrl) {
    return false
  }

  try {
    // Ensure client is initialized
    if (!getLangfuseClient()) {
      return false
    }

    // Send a dummy ingestion request to verify connectivity and auth
    const response = await fetch(`${config.langfuse.baseUrl}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Construct Basic Auth header manually for the test request
        'Authorization': `Basic ${Buffer.from(`${config.langfuse.publicKey}:${config.langfuse.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({ batch: [] }),
    })

    // 2XX is success, 400 means auth passed but payload invalid (still healthy connection)
    return response.ok || response.status === 400
  } catch (error) {
    // Log failure
    log.warn('Langfuse health check failed', { error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

// ---------------------------------------------------------------------------
// LangfuseTraceService — structured trace/span/generation helpers
// ---------------------------------------------------------------------------

/**
 * Singleton service for creating structured Langfuse traces, spans, and generations.
 * All methods are fire-and-forget safe — callers should wrap in try/catch.
 *
 * @description Provides a high-level API on top of the raw Langfuse SDK
 *   for consistent trace instrumentation across the RAG pipeline.
 */
export class LangfuseTraceService {
  /** Singleton instance */
  private static instance: LangfuseTraceService

  /** Private constructor to enforce singleton pattern */
  private constructor() {}

  /**
   * Get or create the singleton instance.
   * @returns LangfuseTraceService - The singleton instance.
   * @description Returns the single shared instance of LangfuseTraceService.
   */
  static getInstance(): LangfuseTraceService {
    // Create instance on first access
    if (!LangfuseTraceService.instance) {
      LangfuseTraceService.instance = new LangfuseTraceService()
    }
    return LangfuseTraceService.instance
  }

  /**
   * Create a new Langfuse trace.
   * @param params - Trace creation parameters.
   * @returns LangfuseTraceClient - The created trace handle.
   * @description Creates a top-level trace representing a full pipeline execution.
   */
  createTrace(params: CreateTraceParams): LangfuseTraceClient {
    // Get the shared Langfuse client
    const client = getLangfuseClient()

    // Build trace options, only including defined properties
    const traceOpts: Record<string, unknown> = { name: params.name }
    if (params.userId != null) traceOpts.userId = params.userId
    if (params.sessionId != null) traceOpts.sessionId = params.sessionId
    if (params.input !== undefined) traceOpts.input = params.input
    if (params.output !== undefined) traceOpts.output = params.output
    if (params.metadata != null) traceOpts.metadata = params.metadata
    if (params.tags != null) traceOpts.tags = params.tags

    // Create trace with provided parameters
    return client.trace(traceOpts as any)
  }

  /**
   * Create a span under a trace or another span.
   * @param parent - The parent trace or span.
   * @param params - Span creation parameters.
   * @returns LangfuseSpanClient - The created span handle.
   * @description Spans represent sub-steps within a trace (e.g. retrieval, reranking).
   */
  createSpan(parent: LangfuseParent, params: CreateSpanParams): LangfuseSpanClient {
    // Create span as a child of the parent
    return parent.span({
      name: params.name,
      input: params.input,
      output: params.output,
      metadata: params.metadata,
    })
  }

  /**
   * Create a generation (LLM call) under a trace or span.
   * @param parent - The parent trace or span.
   * @param params - Generation creation parameters.
   * @returns LangfuseGenerationClient - The created generation handle.
   * @description Generations represent LLM calls with prompt bodies and token usage.
   */
  createGeneration(parent: LangfuseParent, params: CreateGenerationParams): LangfuseGenerationClient {
    // Build generation options object
    const genOpts: Record<string, unknown> = {
      name: params.name,
      input: params.input,
      output: params.output,
      model: params.model,
    }

    // Add metadata if provided
    if (params.metadata) {
      genOpts.metadata = params.metadata
    }

    // Add usage object if token counts are provided
    if (params.usage) {
      genOpts.usage = {
        input: params.usage.promptTokens,
        output: params.usage.completionTokens,
        total: params.usage.totalTokens,
        unit: 'TOKENS',
      }
    }

    // Create generation as a child of the parent
    return parent.generation(genOpts as any)
  }

  /**
   * Update a trace with output data after pipeline completion.
   * @param trace - The trace to update.
   * @param params - Update parameters (output, metadata).
   * @description Sets the final output and any additional metadata on the trace.
   */
  updateTrace(trace: LangfuseTraceClient, params: { output?: unknown; metadata?: Record<string, unknown> }): void {
    // Update trace with final output and metadata
    trace.update({
      output: params.output,
      metadata: params.metadata,
    })
  }

  /**
   * Flush all pending Langfuse events to the server.
   * @returns Promise<void>
   * @description Ensures all buffered events are sent. Call at the end of a pipeline.
   */
  async flush(): Promise<void> {
    // Flush the shared client's event buffer
    await getLangfuseClient().flushAsync()
  }
}

/** Singleton instance of the Langfuse trace service */
export const langfuseTraceService = LangfuseTraceService.getInstance()
