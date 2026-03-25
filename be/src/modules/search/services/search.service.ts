
/**
 * @fileoverview Search service for managing search apps and executing searches.
 *
 * Uses the existing RagSearchService for OpenSearch queries and
 * stores search app configurations in PostgreSQL.
 *
 * @module services/search
 */

import { Response } from 'express'
import { ModelFactory } from '@/shared/models/factory.js'
import { SearchApp, SearchAppAccess, ChunkResult, SearchRequest } from '@/shared/models/types.js'
import { ragSearchService } from '@/modules/rag/services/rag-search.service.js'
import { ragRerankService } from '@/modules/rag/services/rag-rerank.service.js'
import { ragCitationService } from '@/modules/rag/services/rag-citation.service.js'
import { llmClientService } from '@/shared/services/llm-client.service.js'
import { askSummaryPrompt, citationPrompt } from '@/shared/prompts/index.js'
import { relatedQuestionsService } from '@/shared/services/related-questions.service.js'
import { htmlToMarkdown } from '@/shared/utils/html-to-markdown.js'
import { log } from '@/shared/services/logger.service.js'
import { langfuseTraceService } from '@/shared/services/langfuse.service.js'
import { queryLogService } from '@/modules/rag/index.js'
import type { LangfuseTraceClient } from 'langfuse'

/**
 * @description Service handling search app CRUD, RBAC-based listing, multi-dataset search execution,
 *   AI-powered summary streaming, related question generation, and mindmap creation
 */
export class SearchService {
  /**
   * Normalize a search method from runtime options or stored app configuration.
   * @param method - Candidate search method value
   * @returns A valid retrieval-layer search method
   */
  private normalizeMethod(method?: unknown): 'full_text' | 'semantic' | 'hybrid' {
    if (method === 'fulltext') return 'full_text'
    if (method === 'full_text' || method === 'semantic' || method === 'hybrid') {
      return method
    }
    return 'full_text'
  }

  /**
   * Merge app-level and runtime metadata filters into a single AND filter.
   * @param appFilter - App-configured metadata filter
   * @param runtimeFilter - Request-time metadata filter
   * @returns Combined metadata filter or undefined
   */
  private mergeMetadataFilters(
    appFilter?: SearchRequest['metadata_filter'],
    runtimeFilter?: SearchRequest['metadata_filter'],
  ): SearchRequest['metadata_filter'] | undefined {
    const appConditions = appFilter?.conditions ?? []
    const runtimeConditions = runtimeFilter?.conditions ?? []
    const conditions = [...appConditions, ...runtimeConditions]

    if (conditions.length === 0) return undefined

    return {
      logic: 'and',
      conditions,
    }
  }

  /**
   * @description Create a new search app configuration in the database
   * @param {object} data - Search app creation data including name, dataset_ids, and optional config
   * @param {string} userId - ID of the user creating the app
   * @returns {Promise<SearchApp>} The created SearchApp record
   */
  async createSearchApp(
    data: {
      name: string
      description?: string
      dataset_ids: string[]
      search_config?: Record<string, unknown>
      is_public?: boolean
    },
    userId: string
  ): Promise<SearchApp> {
    // Insert search app record
    const app = await ModelFactory.searchApp.create({
      name: data.name,
      description: data.description || null,
      dataset_ids: JSON.stringify(data.dataset_ids),
      search_config: JSON.stringify(data.search_config || {}),
      is_public: data.is_public ?? false,
      created_by: userId,
      updated_by: userId,
    } as unknown as Partial<SearchApp>)

    log.info('Search app created', { appId: app.id, userId })
    return app
  }

  /**
   * @description Update an existing search app with partial data
   * @param {string} searchId - UUID of the search app to update
   * @param {Partial<Pick<SearchApp, 'name' | 'description' | 'dataset_ids' | 'search_config' | 'is_public'>>} data - Partial search app data
   * @param {string} userId - ID of the user performing the update
   * @returns {Promise<SearchApp | undefined>} The updated SearchApp if found, undefined otherwise
   */
  async updateSearchApp(
    searchId: string,
    data: Partial<Pick<SearchApp, 'name' | 'description' | 'dataset_ids' | 'search_config' | 'is_public'>>,
    userId: string
  ): Promise<SearchApp | undefined> {
    // Stringify JSONB fields before DB update
    const updatePayload: any = { ...data, updated_by: userId }
    if (data.dataset_ids !== undefined) updatePayload.dataset_ids = JSON.stringify(data.dataset_ids)
    if (data.search_config !== undefined) updatePayload.search_config = JSON.stringify(data.search_config)

    const updated = await ModelFactory.searchApp.update(searchId, updatePayload as Partial<SearchApp>)

    if (updated) {
      log.info('Search app updated', { searchId, userId })
    }
    return updated
  }

  /**
   * @description List all search apps, optionally filtered by creator user
   * @param {string} [userId] - Optional user ID to filter by creator
   * @returns {Promise<SearchApp[]>} Array of SearchApp records
   */
  async listSearchApps(userId?: string): Promise<SearchApp[]> {
    const filter = userId ? { created_by: userId } : undefined
    return ModelFactory.searchApp.findAll(filter, { orderBy: { created_at: 'desc' } })
  }

  /**
   * @description Retrieve a single search app by its UUID
   * @param {string} searchId - UUID of the search app
   * @returns {Promise<SearchApp | undefined>} The SearchApp if found, undefined otherwise
   */
  async getSearchApp(searchId: string): Promise<SearchApp | undefined> {
    return ModelFactory.searchApp.findById(searchId)
  }

  /**
   * @description Delete a search app by its UUID
   * @param {string} searchId - UUID of the search app to delete
   * @returns {Promise<void>}
   */
  async deleteSearchApp(searchId: string): Promise<void> {
    await ModelFactory.searchApp.delete(searchId)
    log.info('Search app deleted', { searchId })
  }

  /**
   * List search apps accessible to a user based on RBAC rules.
   * Admins see all apps. Other users see apps they created,
   * public apps, and apps shared with them or their teams.
   * @param userId - UUID of the requesting user
   * @param userRole - Role of the requesting user (e.g., 'admin', 'user')
   * @param teamIds - Array of team UUIDs the user belongs to
   * @param options - Paging, sorting, and searching
   * @returns Array of accessible SearchApp records or paginated object
   */
  async listAccessibleApps(
    userId: string,
    userRole: string,
    teamIds: string[],
    options?: { page?: number; pageSize?: number; search?: string; sortBy?: string; sortOrder?: string }
  ): Promise<{ data: SearchApp[]; total: number }> {
    const page = options?.page ?? 1
    const pageSize = options?.pageSize ?? 20
    const sortBy = options?.sortBy || 'created_at'
    const sortOrder = options?.sortOrder || 'desc'

    // Build base query
    let baseQuery = ModelFactory.searchApp.getKnex()

    // RBAC filter: admins see all, others see own + public + shared
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      const accessibleIds = await ModelFactory.searchAppAccess.findAccessibleAppIds(userId, teamIds)
      baseQuery = baseQuery.where(function (this: any) {
        this.where('created_by', userId)
        this.orWhere('is_public', true)
        if (accessibleIds.length > 0) {
          this.orWhereIn('id', accessibleIds)
        }
      })
    }

    // Apply search filter
    if (options?.search) {
      baseQuery = baseQuery.andWhere(function (this: any) {
        this.where('name', 'ilike', `%${options!.search}%`)
          .orWhere('description', 'ilike', `%${options!.search}%`)
      })
    }

    // Count total before pagination
    const countResult = await baseQuery.clone().clearSelect().clearOrder().count('* as count').first()
    const total = Number((countResult as any)?.count || 0)

    // Apply sort and pagination
    const data = await baseQuery
      .orderBy(sortBy, sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return { data, total }
  }

  /**
   * List only public search apps (for unauthenticated users).
   * @param options - Paging, sorting, and searching
   * @returns Paginated object with public apps
   */
  async listPublicApps(
    options?: { page?: number; page_size?: number; search?: string; sort_by?: string; sort_order?: string }
  ): Promise<{ data: SearchApp[]; total: number }> {
    const page = Number(options?.page) || 1
    const pageSize = Number(options?.page_size) || 20
    const sortBy = options?.sort_by || 'created_at'
    const sortOrder = options?.sort_order || 'desc'

    // Only return public apps
    let baseQuery = ModelFactory.searchApp.getKnex().where('is_public', true)

    // Apply search filter
    if (options?.search) {
      baseQuery = baseQuery.andWhere(function (this: any) {
        this.where('name', 'ilike', `%${options!.search}%`)
          .orWhere('description', 'ilike', `%${options!.search}%`)
      })
    }

    // Count total before pagination
    const countResult = await baseQuery.clone().clearSelect().clearOrder().count('* as count').first()
    const total = Number((countResult as any)?.count || 0)

    // Apply sort and pagination
    const data = await baseQuery
      .orderBy(sortBy, sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return { data, total }
  }

  /**
   * Get access control entries for a search app, enriched with display names.
   * Joins with users and teams tables to resolve entity names.
   * @param appId - UUID of the search app
   * @returns Array of access entries with display_name field
   */
  async getAppAccess(
    appId: string
  ): Promise<Array<SearchAppAccess & { display_name?: string | undefined }>> {
    // Fetch raw access entries for the app
    const entries = await ModelFactory.searchAppAccess.findByAppId(appId)

    // Separate user and team entries for batch name resolution
    const userIds = entries.filter((e) => e.entity_type === 'user').map((e) => e.entity_id)
    const teamIds = entries.filter((e) => e.entity_type === 'team').map((e) => e.entity_id)

    // Build lookup maps for display names
    const userMap = new Map<string, string>()
    const teamMap = new Map<string, string>()

    // Batch fetch user display names
    if (userIds.length > 0) {
      const users = await ModelFactory.user.getKnex()
        .select('id', 'display_name')
        .whereIn('id', userIds)
      for (const u of users) {
        userMap.set(u.id, u.display_name)
      }
    }

    // Batch fetch team names
    if (teamIds.length > 0) {
      const teams = await ModelFactory.team.getKnex()
        .select('id', 'name')
        .whereIn('id', teamIds)
      for (const t of teams) {
        teamMap.set(t.id, t.name)
      }
    }

    // Enrich entries with resolved display names
    return entries.map((entry) => ({
      ...entry,
      display_name:
        entry.entity_type === 'user'
          ? userMap.get(entry.entity_id)
          : teamMap.get(entry.entity_id),
    }))
  }

  /**
   * Set (bulk replace) access control entries for a search app.
   * Removes all existing entries and inserts the provided ones.
   * @param appId - UUID of the search app
   * @param entries - Array of access entries to set
   * @param userId - UUID of the user performing the operation
   * @returns Array of newly created access entries
   */
  async setAppAccess(
    appId: string,
    entries: Array<{ entity_type: 'user' | 'team'; entity_id: string }>,
    userId: string
  ): Promise<SearchAppAccess[]> {
    // Bulk replace access entries within a transaction
    const result = await ModelFactory.searchAppAccess.bulkReplace(appId, entries, userId)
    log.info('Search app access updated', { appId, entryCount: entries.length, userId })
    return result
  }

  /**
   * Check if a user has access to a specific search app.
   * Admins always have access. Other users need to be the creator,
   * or the app must be public, or they must have an explicit grant.
   * @param appId - UUID of the search app
   * @param userId - UUID of the user to check
   * @param userRole - Role of the user
   * @param teamIds - Array of team UUIDs the user belongs to
   * @returns True if the user can access the search app
   */
  async checkUserAccess(
    appId: string,
    userId: string | undefined,
    userRole: string | undefined,
    teamIds: string[]
  ): Promise<boolean> {
    // Admins always have access
    if (userRole === 'admin' || userRole === 'superadmin') {
      return true
    }

    // Fetch the app to check ownership and public flag
    const app = await ModelFactory.searchApp.findById(appId)
    if (!app) {
      return false
    }

    // Public apps are accessible to everyone (including anonymous)
    if (app.is_public) {
      return true
    }

    // Anonymous users cannot access non-public apps
    if (!userId) {
      return false
    }

    // Creator always has access to their own app
    if (app.created_by === userId) {
      return true
    }

    // Check explicit access grants for user or their teams
    const accessibleIds = await ModelFactory.searchAppAccess.findAccessibleAppIds(userId, teamIds)
    return accessibleIds.includes(appId)
  }

  /**
   * Execute a search query against datasets configured in a search app.
   * Searches across all dataset IDs and merges results.
   * @param {string} tenantId - Tenant ID for mandatory OpenSearch isolation (from request context)
   * @param {string} searchId - UUID of the search app
   * @param {string} query - The search query string
   * @param {object} [options] - Pagination and search configuration parameters
   * @returns Object with chunks array and total count
   */
  async executeSearch(
    tenantId: string,
    searchId: string,
    query: string,
    options?: {
      topK?: number
      method?: 'full_text' | 'semantic' | 'hybrid'
      similarityThreshold?: number
      vectorSimilarityWeight?: number
      docIds?: string[]
      metadataFilter?: SearchRequest['metadata_filter']
      page?: number
      pageSize?: number
      /** User ID for analytics logging (optional for backward compatibility) */
      userId?: string
    }
  ): Promise<{ chunks: any[]; total: number; doc_aggs?: any[] }> {
    const searchStart = Date.now()

    // Load the search app to get dataset IDs
    const app = await ModelFactory.searchApp.findById(searchId)
    if (!app) {
      throw new Error('Search app not found')
    }

    const searchConfig = (app.search_config as Record<string, unknown>) || {}
    const page = options?.page ?? 1
    const pageSize = options?.pageSize ?? 10
    const requestedTopK = options?.topK ?? Number(searchConfig.top_k ?? 10)
    const topK = Math.max(requestedTopK, page * pageSize)
    const method = this.normalizeMethod(options?.method ?? searchConfig.search_method)
    const similarityThreshold = options?.similarityThreshold ?? Number(searchConfig.similarity_threshold ?? 0)
    const vectorSimilarityWeight = options?.vectorSimilarityWeight
      ?? (typeof searchConfig.vector_similarity_weight === 'number'
        ? searchConfig.vector_similarity_weight as number
        : undefined)
    const metadataFilter = this.mergeMetadataFilters(
      searchConfig.metadata_filter as SearchRequest['metadata_filter'] | undefined,
      options?.metadataFilter,
    )

    // Use shared retrieveChunks (applies embedding + reranking) with highlight enabled for search results
    const { chunks: allChunks, total: totalHits } = await this.retrieveChunks(
      tenantId,
      app,
      query,
      topK,
      method,
      similarityThreshold,
      vectorSimilarityWeight,
      metadataFilter,
      options?.docIds,
      true,
    )

    // Apply pagination after retrieval so later pages preserve the full filter set.
    const start = (page - 1) * pageSize
    const limited = allChunks.slice(start, start + pageSize)

    // Map content fields for FE compatibility
    const mappedChunks = limited.map((c: any) => ({
      ...c,
      content: c.text,
      content_with_weight: c.text,
    }))

    // Async analytics logging — fire-and-forget, non-blocking
    // Uses the highest chunk score as confidence proxy
    if (options?.userId && tenantId) {
      const topScore = allChunks.length > 0
        ? Math.max(...allChunks.map(c => c.score ?? 0))
        : null
      const datasetIds = Array.isArray(app.dataset_ids)
        ? app.dataset_ids
        : JSON.parse(app.dataset_ids as unknown as string)
      queryLogService.logQuery({
        source: 'search',
        source_id: searchId,
        user_id: options.userId,
        tenant_id: tenantId,
        query,
        dataset_ids: datasetIds,
        result_count: allChunks.length,
        ...(topScore != null ? { confidence_score: topScore } : {}),
        response_time_ms: Date.now() - searchStart,
        failed_retrieval: allChunks.length === 0,
      })
    }

    return { chunks: mappedChunks, total: totalHits, doc_aggs: this.buildDocAggs(allChunks) }
  }

  /**
   * @description Perform a dry-run retrieval test without LLM summary for testing search quality
   * @param {string} searchId - UUID of the search app
   * @param {any} data - Request body containing query, top_k, method, similarity_threshold
   * @returns {Promise<{ chunks: any[], doc_aggs: any[] }>} Raw chunks with scores and document aggregations
   * @throws {Error} If search app not found
   */
  async retrievalTest(
    tenantId: string,
    searchId: string,
    data: any,
  ): Promise<{ chunks: any[]; total: number; page: number; page_size: number; doc_aggs: any[] }> {
    const app = await ModelFactory.searchApp.findById(searchId)
    if (!app) throw new Error('Search app not found')

    const searchConfig = (app.search_config as Record<string, unknown>) || {}
    const page = data.page ?? 1
    const pageSize = data.page_size ?? 10
    const requestedTopK = data.top_k ?? Number(searchConfig.top_k ?? 30)
    const topK = Math.max(requestedTopK, page * pageSize)
    const method = this.normalizeMethod(data.method ?? data.search_method ?? searchConfig.search_method ?? 'hybrid')
    const similarityThreshold = data.similarity_threshold ?? Number(searchConfig.similarity_threshold ?? 0)
    const vectorSimilarityWeight = data.vector_similarity_weight
      ?? (typeof searchConfig.vector_similarity_weight === 'number'
        ? searchConfig.vector_similarity_weight as number
        : undefined)
    const metadataFilter = this.mergeMetadataFilters(
      searchConfig.metadata_filter as SearchRequest['metadata_filter'] | undefined,
      data.metadata_filter,
    )

    // Enable highlight for retrieval test results so matched terms are visible
    const { chunks, total } = await this.retrieveChunks(
      tenantId,
      app,
      data.query,
      topK,
      method,
      similarityThreshold,
      vectorSimilarityWeight,
      metadataFilter as any,
      data.doc_ids,
      true,
    )
    const limitedChunks = chunks.slice((page - 1) * pageSize, page * pageSize)

    return {
      chunks: limitedChunks.map((c, i) => ({
        ...c,
        chunk_id: c.chunk_id,
        id: i,
        content: c.text,
        content_with_weight: c.text,
      })),
      total,
      page,
      page_size: pageSize,
      doc_aggs: this.buildDocAggs(chunks),
    }
  }

  /**
   * Embed a query string for semantic/hybrid search.
   * Returns null if no embedding model is configured or embedding fails.
   * @param query - The query string to embed
   * @param providerId - Optional embedding provider ID
   * @returns The query embedding vector, or null on failure
   */
  private async embedQuery(query: string, providerId?: string): Promise<number[] | null> {
    try {
      const vectors = await llmClientService.embedTexts([query], providerId)
      return vectors[0] ?? null
    } catch (err) {
      log.warn('Query embedding failed, falling back to full-text search', { error: (err as Error).message })
      return null
    }
  }

  /**
   * Retrieve chunks from all datasets of a search app, with optional reranking.
   * @param app - The search app configuration
   * @param query - Search query string
   * @param topK - Maximum results
   * @param method - Search method
   * @param similarityThreshold - Minimum similarity score
   * @param vectorSimilarityWeight - Optional weight for vector vs text scoring
   * @param metadataFilter - Optional metadata filter conditions
   * @returns Object with chunk results array and total hit count
   * @description Shared retrieval logic used by askSearch, executeSearch, and mindmap
   * @param {boolean} highlight - Whether to request OpenSearch highlight snippets with <em> tags
   */
  private async retrieveChunks(
    tenantId: string,
    app: SearchApp,
    query: string,
    topK: number = 10,
    method: 'full_text' | 'semantic' | 'hybrid' = 'full_text',
    similarityThreshold: number = 0,
    vectorSimilarityWeight?: number,
    metadataFilter?: { logic: string; conditions: Array<{ name: string; comparison_operator: string; value: unknown }> },
    docIds?: string[],
    highlight: boolean = false,
  ): Promise<{ chunks: ChunkResult[]; total: number }> {
    // Parse dataset_ids (may be stored as JSONB)
    const datasetIds: string[] = Array.isArray(app.dataset_ids)
      ? app.dataset_ids
      : JSON.parse(app.dataset_ids as unknown as string)

    // Embed query for semantic/hybrid search
    let queryVector: number[] | null = null
    if (method !== 'full_text') {
      queryVector = await this.embedQuery(query)
    }

    // Search across all datasets and merge results
    const allChunks: ChunkResult[] = []
    let totalHits = 0
    for (const datasetId of datasetIds) {
      const searchReq: SearchRequest = {
        query,
        top_k: topK,
        method,
        similarity_threshold: similarityThreshold,
      }
      if (vectorSimilarityWeight != null) searchReq.vector_similarity_weight = vectorSimilarityWeight
      if (metadataFilter) searchReq.metadata_filter = metadataFilter as NonNullable<SearchRequest['metadata_filter']>
      if (docIds?.length) searchReq.doc_ids = docIds

      const result = await ragSearchService.search(
        tenantId,
        datasetId,
        searchReq,
        queryVector,
        [],
        highlight,
      )
      // Warn if a dataset returned no results (may have been deleted)
      if (result.chunks.length === 0) {
        log.warn(`Dataset ${datasetId} returned no results — it may have been deleted`)
      }
      allChunks.push(...result.chunks)
      totalHits += result.total
    }

    // Sort by score descending and limit
    allChunks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    let chunks = allChunks.slice(0, topK)

    // Rerank if configured, using rerank_top_k as the input size limit
    const config = app.search_config as Record<string, unknown>
    if (config?.rerank_id) {
      const rerankTopK = (config.rerank_top_k as number) ?? 1024
      chunks = await ragRerankService.rerank(query, chunks, rerankTopK, config.rerank_id as string)
    }

    return { chunks, total: totalHits }
  }

  /**
   * Build formatted knowledge context from chunks for LLM prompts.
   * @param chunks - Array of chunk results
   * @returns Formatted knowledge string with chunk IDs
   * @description Formats each chunk with an ID marker for citation referencing
   */
  private buildKnowledgeContext(chunks: ChunkResult[]): string {
    return chunks
      .map((chunk, i) => {
        // Convert HTML (e.g. tables from Excel parser) to compact Markdown for LLM token savings
        const text = htmlToMarkdown(chunk.text)
        return `### Chunk ID: ${i}\n**Source**: ${chunk.doc_name || 'Unknown'}\n\n${text}`
      })
      .join('\n\n---\n\n')
  }

  /**
   * Build document aggregation data from chunks for reference output.
   * @param chunks - Array of chunk results
   * @returns Array of document aggregation objects with doc_id, doc_name, and count
   * @description Groups chunks by document and counts occurrences
   */
  private buildDocAggs(chunks: ChunkResult[]): { doc_id: string; doc_name: string; count: number }[] {
    const docMap = new Map<string, { doc_id: string; doc_name: string; count: number }>()
    for (const chunk of chunks) {
      const docId = chunk.doc_id || 'unknown'
      const existing = docMap.get(docId)
      if (existing) {
        existing.count++
      } else {
        docMap.set(docId, { doc_id: docId, doc_name: chunk.doc_name || 'Unknown', count: 1 })
      }
    }
    return Array.from(docMap.values())
  }

  /**
   * Stream an AI-generated summary answer for a search query via SSE.
   * @param searchId - UUID of the search app
   * @param params - Query parameters (query, top_k, method, similarity_threshold, vector_similarity_weight)
   * @param res - Express response object for SSE streaming
   * @description Retrieves chunks, builds context, streams LLM answer with citations,
   *   and optionally generates related questions. Uses SSE protocol for real-time streaming.
   */
  async askSearch(
    tenantId: string,
    searchId: string,
    params: {
      query: string
      top_k?: number
      method?: 'full_text' | 'semantic' | 'hybrid'
      similarity_threshold?: number
      vector_similarity_weight?: number
      metadata_filter?: SearchRequest['metadata_filter']
      doc_ids?: string[]
    },
    res: Response
  ): Promise<void> {
    const startTime = Date.now()

    // Load search app config
    const app = await ModelFactory.searchApp.findById(searchId)
    if (!app) {
      throw new Error('Search app not found')
    }

    const searchConfig = app.search_config as Record<string, unknown>
    const query = params.query
    const topK = params.top_k ?? Number(searchConfig.top_k ?? 10)
    const method = this.normalizeMethod(params.method ?? searchConfig.search_method)
    const similarityThreshold = params.similarity_threshold ?? Number(searchConfig.similarity_threshold ?? 0)
    const vectorSimilarityWeight = params.vector_similarity_weight
      ?? (typeof searchConfig.vector_similarity_weight === 'number'
        ? searchConfig.vector_similarity_weight as number
        : undefined)
    const metadataFilter = this.mergeMetadataFilters(
      searchConfig.metadata_filter as SearchRequest['metadata_filter'] | undefined,
      params.metadata_filter,
    )

    // Create Langfuse trace for the search pipeline (fire-and-forget)
    let trace: LangfuseTraceClient | undefined
    try {
      trace = langfuseTraceService.createTrace({
        name: 'search-pipeline',
        input: query,
        tags: ['search', 'ask-search'],
        metadata: { searchId },
      })
    } catch (err) {
      log.error('Langfuse search trace creation failed', { error: String(err) })
    }

    // Send retrieving status
    res.write(`data: ${JSON.stringify({ status: 'retrieving' })}\n\n`)

    // Create retrieval span for tracing
    let retrievalSpan: ReturnType<typeof langfuseTraceService.createSpan> | undefined
    if (trace) {
      try { retrievalSpan = langfuseTraceService.createSpan(trace, { name: 'retrieval', input: query }) } catch (err) { log.error('Langfuse span failed', { error: String(err) }) }
    }

    // Retrieve and optionally rerank chunks
    const { chunks, total } = await this.retrieveChunks(
      tenantId,
      app,
      query,
      topK,
      method,
      similarityThreshold,
      vectorSimilarityWeight,
      metadataFilter as any,
      params.doc_ids,
    )

    // End retrieval span with chunk texts
    if (retrievalSpan) {
      try { retrievalSpan.end({ output: chunks.map(c => c.text) }) } catch (err) { log.error('Langfuse span end failed', { error: String(err) }) }
    }

    // Build knowledge context from chunks
    const knowledge = this.buildKnowledgeContext(chunks)

    // Build reference data
    const reference = {
      chunks: chunks.map((c, i) => ({
        ...c,
        chunk_id: c.chunk_id,
        id: i,
        content: c.text,
        content_with_weight: c.text,
      })),
      doc_aggs: this.buildDocAggs(chunks),
      total,
    }

    // Send generating status and reference
    if (searchConfig?.enable_summary !== false) {
      res.write(`data: ${JSON.stringify({ status: 'generating' })}\n\n`)
    }
    res.write(`data: ${JSON.stringify({ reference })}\n\n`)

    // When summary is disabled, return retrieval output without invoking the LLM.
    if (searchConfig?.enable_summary === false) {
      let relatedQuestions: string[] = []
      if (searchConfig?.enable_related_questions) {
        try {
          relatedQuestions = await relatedQuestionsService.generateRelatedQuestions(query, searchConfig?.llm_id as string | undefined)
        } catch (err) {
          log.warn('Failed to generate related questions', { error: (err as Error).message })
        }
      }

      res.write(`data: ${JSON.stringify({
        answer: '',
        reference,
        related_questions: relatedQuestions,
        total,
        metrics: {
          retrieval_ms: Date.now() - startTime,
          chunks_retrieved: chunks.length,
        },
      })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // Build system prompt with knowledge context and citation instructions
    const systemPrompt = `${askSummaryPrompt.build(knowledge)}\n\n${citationPrompt.system}`

    // Create main-completion span for the LLM streaming call
    let mainSpan: ReturnType<typeof langfuseTraceService.createSpan> | undefined
    if (trace) {
      try { mainSpan = langfuseTraceService.createSpan(trace, { name: 'main-completion' }) } catch (err) { log.error('Langfuse span failed', { error: String(err) }) }
    }

    // Stream LLM answer
    let fullAnswer = ''
    const stream = llmClientService.chatCompletionStream(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      {
        providerId: searchConfig?.llm_id as string | undefined,
        temperature: ((searchConfig?.llm_setting as any)?.temperature as number) ?? 0.7,
        max_tokens: ((searchConfig?.llm_setting as any)?.max_tokens as number) ?? undefined,
        top_p: ((searchConfig?.llm_setting as any)?.top_p as number) ?? undefined,
      },
      mainSpan
    )

    // Write each delta token as an SSE event
    for await (const chunk of stream) {
      if (chunk.content) {
        fullAnswer += chunk.content
        res.write(`data: ${JSON.stringify({ delta: chunk.content })}\n\n`)
      }
    }

    // End main-completion span
    if (mainSpan) {
      try { mainSpan.end({ output: fullAnswer }) } catch (err) { log.error('Langfuse span end failed', { error: String(err) }) }
    }

    // Post-process citations
    const citedAnswer = await ragCitationService.insertCitations(fullAnswer, chunks)

    // Generate related questions if configured
    let relatedQuestions: string[] = []
    if (searchConfig?.enable_related_questions) {
      try {
        relatedQuestions = await relatedQuestionsService.generateRelatedQuestions(query, searchConfig?.llm_id as string | undefined)
      } catch (err) {
        log.warn('Failed to generate related questions', { error: (err as Error).message })
      }
    }

    // Calculate metrics
    const metrics = {
      retrieval_ms: Date.now() - startTime,
      chunks_retrieved: chunks.length,
    }

    // Send final event with complete answer, reference, related questions, and metrics
    res.write(`data: ${JSON.stringify({
      answer: citedAnswer,
      reference,
      related_questions: relatedQuestions,
      metrics,
    })}\n\n`)

    // Update trace with final output and flush (fire-and-forget)
    if (trace) {
      try {
        langfuseTraceService.updateTrace(trace, { output: citedAnswer })
        await langfuseTraceService.flush()
      } catch (err) {
        log.error('Langfuse trace finalization failed', { error: String(err) })
      }
    }

    // Signal stream completion
    res.write('data: [DONE]\n\n')
    res.end()
  }

  /**
   * Generate related questions for a search app query.
   * @param searchId - UUID of the search app
   * @param query - The user query to generate related questions from
   * @returns Array of related question strings
   * @description Loads search app config for LLM provider, then delegates to the shared service
   */
  async relatedQuestions(searchId: string, query: string): Promise<string[]> {
    // Load search app to get LLM provider config
    const app = await ModelFactory.searchApp.findById(searchId)
    if (!app) {
      throw new Error('Search app not found')
    }

    const config = app.search_config as Record<string, unknown>

    // Skip generation if the feature is explicitly disabled
    if (config?.enable_related_questions === false) {
      return []
    }

    // Delegate to shared service
    return relatedQuestionsService.generateRelatedQuestions(query, config?.llm_id as string | undefined)
  }

  /**
   * Generate a mind map JSON tree from search results.
   * @param searchId - UUID of the search app
   * @param params - Query parameters (query, top_k, method, similarity_threshold)
   * @returns Hierarchical JSON tree with name and children properties
   * @description Retrieves chunks for the query and sends them to the LLM
   *   to produce a hierarchical mind map structure
   */
  async mindmap(
    tenantId: string,
    searchId: string,
    params: {
      query: string
      top_k?: number
      method?: 'full_text' | 'semantic' | 'hybrid'
      similarity_threshold?: number
      vector_similarity_weight?: number
      metadata_filter?: SearchRequest['metadata_filter']
      doc_ids?: string[]
    }
  ): Promise<{ name: string; children: unknown[] }> {
    // Load search app config
    const app = await ModelFactory.searchApp.findById(searchId)
    if (!app) {
      throw new Error('Search app not found')
    }

    const config = app.search_config as Record<string, unknown>
    const query = params.query
    const topK = params.top_k ?? Number(config.top_k ?? 10)
    const method = this.normalizeMethod(params.method ?? config.search_method)
    const similarityThreshold = params.similarity_threshold ?? Number(config.similarity_threshold ?? 0)
    const vectorSimilarityWeight = params.vector_similarity_weight
      ?? (typeof config.vector_similarity_weight === 'number'
        ? config.vector_similarity_weight as number
        : undefined)
    const metadataFilter = this.mergeMetadataFilters(
      config.metadata_filter as SearchRequest['metadata_filter'] | undefined,
      params.metadata_filter,
    )

    // Retrieve chunks for context
    const { chunks } = await this.retrieveChunks(
      tenantId,
      app,
      query,
      topK,
      method,
      similarityThreshold,
      vectorSimilarityWeight,
      metadataFilter as any,
      params.doc_ids,
    )

    // Build knowledge context
    const knowledge = this.buildKnowledgeContext(chunks)

    // Mindmap generation prompt
    const systemPrompt = `Generate a mind map as JSON tree from the query and retrieved content. Output JSON only, no markdown fences or extra text. Output JSON: {"name": "<root topic>", "children": [{"name": "<subtopic>", "children": [...]}]}`

    // Generate mindmap via LLM
    const response = await llmClientService.chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Query: ${query}\n\nRetrieved content:\n${knowledge}` },
      ],
      {
        providerId: config?.llm_id as string | undefined,
        temperature: 0.3,
      }
    )

    // Parse the JSON response, stripping any markdown fences
    const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    try {
      return JSON.parse(cleaned)
    } catch {
      log.warn('Failed to parse mindmap JSON, returning fallback', { response: cleaned })
      // Return a fallback structure with the raw response
      return { name: query, children: [{ name: cleaned, children: [] }] }
    }
  }
}

/** Singleton instance of the search service */
export const searchService = new SearchService()
