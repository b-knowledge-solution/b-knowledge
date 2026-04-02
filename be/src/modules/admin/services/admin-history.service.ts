/**
 * @fileoverview Admin history service for querying chat, search, and agent run session records.
 * Provides paginated access to user activity history with full-text search support
 * and feedback enrichment (positive/negative counts).
 * @module services/admin-history
 */
import { db } from '@/shared/db/knex.js';
import { ModelFactory } from '@/shared/models/factory.js';
import { MessageRole, FeedbackFilter as FeedbackFilterConst } from '@/shared/constants/index.js';

/** Feedback filter options for session queries. */
export type FeedbackFilter = 'positive' | 'negative' | 'any' | 'none'

/**
 * @description Service for querying chat, search, and agent run history across all users with filtering, pagination, full-text search, and feedback enrichment
 */
export class AdminHistoryService {
    /**
     * @description Build a reusable feedback aggregation subquery for source/session-level counts.
     * @param {'chat' | 'search' | 'agent'} source - Feedback source discriminator
     * @param {string} [tenantId] - Optional tenant scope
     * @returns {import('knex').Knex.QueryBuilder} Grouped feedback aggregate query by source_id
     */
    private buildFeedbackAggregate(source: 'chat' | 'search' | 'agent', tenantId?: string) {
        const feedbackAgg = db('answer_feedback as af')
            .select('af.source_id')
            .select(
                db.raw('COUNT(*) FILTER (WHERE af.thumbup = true)::int as positive_count'),
                db.raw('COUNT(*) FILTER (WHERE af.thumbup = false)::int as negative_count')
            )
            .where('af.source', source)
            .groupBy('af.source_id')

        if (tenantId) {
            feedbackAgg.where('af.tenant_id', tenantId)
        }

        return feedbackAgg
    }
    /**
     * @description Apply feedback filter EXISTS/NOT EXISTS clause to a query builder.
     * @param {any} query - Knex query builder
     * @param {string} source - Feedback source type ('chat' | 'search' | 'agent')
     * @param {string} sourceIdColumn - The column expression for source_id matching
     * @param {FeedbackFilter} [feedbackFilter] - Optional feedback filter
     * @returns {any} Modified query builder
     */
    private applyFeedbackFilter(query: any, source: string, sourceIdColumn: string, feedbackFilter?: FeedbackFilter): any {
        if (!feedbackFilter) return query

        switch (feedbackFilter) {
            case FeedbackFilterConst.POSITIVE:
                // Only sessions that have at least one positive feedback
                return query.whereExists(function (this: any) {
                    this.select(db.raw('1')).from('answer_feedback')
                        .whereRaw(`answer_feedback.source_id = ${sourceIdColumn}`)
                        .where('answer_feedback.source', source)
                        .where('answer_feedback.thumbup', true)
                })
            case FeedbackFilterConst.NEGATIVE:
                // Only sessions that have at least one negative feedback
                return query.whereExists(function (this: any) {
                    this.select(db.raw('1')).from('answer_feedback')
                        .whereRaw(`answer_feedback.source_id = ${sourceIdColumn}`)
                        .where('answer_feedback.source', source)
                        .where('answer_feedback.thumbup', false)
                })
            case FeedbackFilterConst.ANY:
                // Only sessions that have any feedback at all
                return query.whereExists(function (this: any) {
                    this.select(db.raw('1')).from('answer_feedback')
                        .whereRaw(`answer_feedback.source_id = ${sourceIdColumn}`)
                        .where('answer_feedback.source', source)
                })
            case FeedbackFilterConst.NONE:
                // Only sessions with no feedback records
                return query.whereNotExists(function (this: any) {
                    this.select(db.raw('1')).from('answer_feedback')
                        .whereRaw(`answer_feedback.source_id = ${sourceIdColumn}`)
                        .where('answer_feedback.source', source)
                })
            default:
                return query
        }
    }

    /**
     * @description Retrieve paginated chat history sessions with optional full-text search, email, date range, and feedback filters.
     * Enriches results with positive_count and negative_count from answer_feedback table.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Full-text search query applied to messages and email
     * @param {string} email - Filter sessions by user email (partial match)
     * @param {string} startDate - Lower bound date filter (inclusive)
     * @param {string} endDate - Upper bound date filter (inclusive, extended to end of day)
     * @param {string} [sourceName] - Optional source name filter
     * @param {FeedbackFilter} [feedbackFilter] - Optional feedback status filter
     * @returns {Promise<any[]>} Paginated array of chat session summaries with feedback counts
     */
    async getChatHistory(
        page: number,
        limit: number,
        search: string,
        email: string,
        startDate: string,
        endDate: string,
        sourceName?: string,
        feedbackFilter?: FeedbackFilter,
        tenantId?: string
    ) {
        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // ── External history_chat_sessions ────────────────────────────────
        const extMessageCount = db('history_chat_messages as hcm_count')
            .select('hcm_count.session_id')
            .count('* as message_count')
            .groupBy('hcm_count.session_id')

        const extFirstPrompt = db('history_chat_messages as hcm_first')
            .distinctOn('hcm_first.session_id')
            .select('hcm_first.session_id', 'hcm_first.user_prompt')
            .orderBy('hcm_first.session_id')
            .orderBy('hcm_first.created_at', 'asc')

        const extFeedbackAgg = this.buildFeedbackAggregate('chat', tenantId)

        let extQuery = ModelFactory.historyChatSession.getKnex()
            .select(
                'history_chat_sessions.session_id',
                'history_chat_sessions.updated_at as created_at',
                'history_chat_sessions.user_email',
                db.raw('COALESCE(hcm_first.user_prompt, \'\') as user_prompt'),
                db.raw('COALESCE(hcm_count.message_count, 0)::int as message_count'),
                db.raw('COALESCE(chat_fb.positive_count, 0)::int as positive_count'),
                db.raw('COALESCE(chat_fb.negative_count, 0)::int as negative_count')
            )
            .from('history_chat_sessions')
            .leftJoin(extFirstPrompt.as('hcm_first'), 'hcm_first.session_id', 'history_chat_sessions.session_id')
            .leftJoin(extMessageCount.as('hcm_count'), 'hcm_count.session_id', 'history_chat_sessions.session_id')
            .leftJoin(extFeedbackAgg.as('chat_fb'), 'chat_fb.source_id', 'history_chat_sessions.session_id')
            .orderBy('history_chat_sessions.updated_at', 'desc')
            .limit(limit)
            .offset(offset);

        // Apply full-text search filter across email and message content
        if (search) {
            // Strip special characters to prevent tsquery injection
            const cleanSearch = search.replace(/[^\w\s]/g, '').trim();
            const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0);

            extQuery = extQuery.where(builder => {
                // Match sessions by user email (case-insensitive partial match)
                builder.where('history_chat_sessions.user_email', 'ilike', `%${search}%`)
                    // Or match sessions containing relevant messages via full-text search
                    .orWhereExists(function () {
                        const sub = this.select('id').from('history_chat_messages')
                            .whereRaw('history_chat_messages.session_id = history_chat_sessions.session_id');

                        // Use multiple tsquery strategies for better recall
                        if (terms.length > 0) {
                            // Prefix query: all terms must appear (AND) with prefix matching
                            const prefixQuery = terms.join(' & ') + ':*';
                            // OR query: any term can match
                            const orQuery = terms.join(' | ');
                            sub.where(b => {
                                b.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                                    .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [prefixQuery])
                                    .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [orQuery]);
                            });
                        } else {
                            // Fall back to websearch_to_tsquery for single-term or empty search
                            sub.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search]);
                        }
                    });
            });
        }

        // Filter by user email (partial, case-insensitive)
        if (email) {
            extQuery = extQuery.where('history_chat_sessions.user_email', 'ilike', `%${email}%`);
        }

        // Filter sessions updated on or after the start date
        if (startDate) {
            extQuery = extQuery.where('history_chat_sessions.updated_at', '>=', startDate);
        }

        // Filter sessions updated on or before the end date (extended to end of day)
        if (endDate) {
            extQuery = extQuery.where('history_chat_sessions.updated_at', '<=', `${endDate} 23:59:59`);
        }

        // Apply feedback filter to external query
        extQuery = this.applyFeedbackFilter(extQuery, 'chat', 'history_chat_sessions.session_id', feedbackFilter);

        const externalResults = await extQuery;

        // ── Internal chat_sessions ────────────────────────────────────────
        const intFirstPrompt = db('chat_messages as cm_first')
            .distinctOn('cm_first.session_id')
            .select('cm_first.session_id', 'cm_first.content as user_prompt')
            .where('cm_first.role', MessageRole.USER)
            .orderBy('cm_first.session_id')
            .orderBy('cm_first.timestamp', 'asc')

        const intMessageCount = db('chat_messages as cm_count')
            .select('cm_count.session_id')
            .count('* as message_count')
            .groupBy('cm_count.session_id')

        const intFeedbackAgg = this.buildFeedbackAggregate('chat', tenantId)

        let intQuery = db('chat_sessions')
            .leftJoin('users', 'chat_sessions.user_id', 'users.id')
            .leftJoin(intFirstPrompt.as('cm_first'), 'cm_first.session_id', 'chat_sessions.id')
            .leftJoin(intMessageCount.as('cm_count'), 'cm_count.session_id', 'chat_sessions.id')
            .joinRaw('LEFT JOIN (?) as chat_fb ON chat_fb.source_id = chat_sessions.id::text', [intFeedbackAgg])
            .select(
                'chat_sessions.id as session_id',
                'chat_sessions.created_at',
                'users.email as user_email',
                db.raw('COALESCE(cm_first.user_prompt, \'\') as user_prompt'),
                db.raw('COALESCE(cm_count.message_count, 0)::int as message_count'),
                db.raw('COALESCE(chat_fb.positive_count, 0)::int as positive_count'),
                db.raw('COALESCE(chat_fb.negative_count, 0)::int as negative_count'),
                'chat_sessions.title'
            )
            .orderBy('chat_sessions.created_at', 'desc')
            .limit(limit)
            .offset(offset);

        // Apply search filter
        if (search) {
            intQuery = intQuery.where(builder => {
                builder.where('chat_sessions.title', 'ilike', `%${search}%`)
                    .orWhere('users.email', 'ilike', `%${search}%`)
                    .orWhereExists(function () {
                        this.select('id').from('chat_messages')
                            .whereRaw('chat_messages.session_id = chat_sessions.id')
                            .where('content', 'ilike', `%${search}%`);
                    });
            });
        }

        // Filter by user email
        if (email) {
            intQuery = intQuery.where('users.email', 'ilike', `%${email}%`);
        }

        // Date range filters
        if (startDate) {
            intQuery = intQuery.where('chat_sessions.created_at', '>=', startDate);
        }
        if (endDate) {
            intQuery = intQuery.where('chat_sessions.created_at', '<=', `${endDate} 23:59:59`);
        }

        // Apply feedback filter to internal query
        intQuery = this.applyFeedbackFilter(intQuery, 'chat', 'chat_sessions.id::text', feedbackFilter);

        const internalResults = (await intQuery).map((r: any) => ({ ...r, source: 'internal' }));

        // ── Merge & sort by date descending ───────────────────────────────
        const merged = [...externalResults, ...internalResults];
        merged.sort((a: any, b: any) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateB - dateA;
        });

        return merged.slice(0, limit);
    }

    /**
     * @description Retrieve all messages for a specific chat session ordered chronologically.
     * Checks both external history_chat_messages and internal chat_messages tables.
     * Enriches each message with feedback_thumbup and feedback_comment from answer_feedback.
     * @param {string} sessionId - The unique session identifier
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback queries
     * @returns {Promise<any[]>} Array of chat message records for the session with feedback fields
     */
    async getChatSessionDetails(sessionId: string, tenantId?: string) {
        // Try external history first
        const external = await ModelFactory.historyChatMessage.getKnex()
            .from('history_chat_messages')
            .select('*')
            .where('session_id', sessionId)
            .orderBy('created_at', 'asc');

        // Query feedback records for this chat session (tenant-scoped if provided)
        let feedbackQuery = db('answer_feedback')
            .where('source', 'chat')
            .where('source_id', sessionId)
            .select('message_id', 'thumbup', 'comment')
        if (tenantId) {
            feedbackQuery = feedbackQuery.where('tenant_id', tenantId)
        }
        const feedbackRecords = await feedbackQuery

        // Build a lookup map from message_id to feedback data
        const feedbackMap = new Map(feedbackRecords.map((f: any) => [f.message_id, f]))

        if (external.length > 0) {
            // Merge feedback into external messages by matching message_id to id
            return external.map((msg: any) => ({
                ...msg,
                feedback_thumbup: feedbackMap.get(msg.id)?.thumbup ?? null,
                feedback_comment: feedbackMap.get(msg.id)?.comment ?? null,
            }))
        }

        // Fall back to internal chat_messages
        const messages = await db('chat_messages')
            .where('session_id', sessionId)
            .orderBy('timestamp', 'asc');

        // Pair user+assistant messages into the external format
        const paired: any[] = [];
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.role === MessageRole.USER) {
                const assistantMsg = messages[i + 1]?.role === MessageRole.ASSISTANT ? messages[i + 1] : null;
                // Use assistant message ID for feedback lookup (feedback is on responses)
                const feedbackId = assistantMsg?.id || msg.id
                paired.push({
                    id: msg.id,
                    session_id: sessionId,
                    user_prompt: msg.content,
                    llm_response: assistantMsg?.content || '',
                    citations: assistantMsg?.citations || '[]',
                    created_at: msg.timestamp,
                    source: 'internal',
                    feedback_thumbup: feedbackMap.get(feedbackId)?.thumbup ?? null,
                    feedback_comment: feedbackMap.get(feedbackId)?.comment ?? null,
                });
                if (assistantMsg) i++;
            }
        }

        return paired;
    }

    /**
     * @description Retrieve paginated search history sessions with optional full-text search, email, date range, and feedback filters.
     * Enriches results with positive_count and negative_count from answer_feedback table.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Full-text search query applied to records and email
     * @param {string} email - Filter sessions by user email (partial match)
     * @param {string} startDate - Lower bound date filter (inclusive)
     * @param {string} endDate - Upper bound date filter (inclusive, extended to end of day)
     * @param {string} [sourceName] - Optional source name filter
     * @param {FeedbackFilter} [feedbackFilter] - Optional feedback status filter
     * @returns {Promise<any[]>} Paginated array of search session summaries with feedback counts
     */
    async getSearchHistory(
        page: number,
        limit: number,
        search: string,
        email: string,
        startDate: string,
        endDate: string,
        sourceName?: string,
        feedbackFilter?: FeedbackFilter,
        tenantId?: string
    ) {
        // Calculate pagination offset
        const offset = (page - 1) * limit;

        // Base query on sessions
        const searchFirstInput = db('history_search_records as hsr_first')
            .distinctOn('hsr_first.session_id')
            .select('hsr_first.session_id', 'hsr_first.search_input')
            .orderBy('hsr_first.session_id')
            .orderBy('hsr_first.created_at', 'asc')

        const searchMessageCount = db('history_search_records as hsr_count')
            .select('hsr_count.session_id')
            .count('* as message_count')
            .groupBy('hsr_count.session_id')

        const searchFeedbackAgg = this.buildFeedbackAggregate('search', tenantId)

        let query = ModelFactory.historySearchSession.getKnex()
            .select(
                'history_search_sessions.session_id',
                'history_search_sessions.updated_at as created_at',
                'history_search_sessions.user_email',
                db.raw('COALESCE(hsr_first.search_input, \'\') as search_input'),
                db.raw('COALESCE(hsr_count.message_count, 0)::int as message_count'),
                db.raw('COALESCE(search_fb.positive_count, 0)::int as positive_count'),
                db.raw('COALESCE(search_fb.negative_count, 0)::int as negative_count')
            )
            .from('history_search_sessions')
            .leftJoin(searchFirstInput.as('hsr_first'), 'hsr_first.session_id', 'history_search_sessions.session_id')
            .leftJoin(searchMessageCount.as('hsr_count'), 'hsr_count.session_id', 'history_search_sessions.session_id')
            .leftJoin(searchFeedbackAgg.as('search_fb'), 'search_fb.source_id', 'history_search_sessions.session_id')

            .orderBy('history_search_sessions.updated_at', 'desc')
            .limit(limit)
            .offset(offset);

        // Apply full-text search filter across email and search record content
        if (search) {
            // Strip special characters to prevent tsquery injection
            const cleanSearch = search.replace(/[^\w\s]/g, '').trim();
            const terms = cleanSearch.split(/\s+/).filter(t => t.length > 0);

            query = query.where(builder => {
                // Match sessions by user email (case-insensitive partial match)
                builder.where('history_search_sessions.user_email', 'ilike', `%${search}%`)
                    // Or match sessions with relevant search records via full-text search
                    .orWhereExists(function () {
                        const sub = this.select('id').from('history_search_records')
                            .whereRaw('history_search_records.session_id = history_search_sessions.session_id');

                        // Use multiple tsquery strategies for better recall
                        if (terms.length > 0) {
                            const prefixQuery = terms.join(' & ') + ':*';
                            const orQuery = terms.join(' | ');
                            sub.where(b => {
                                b.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search])
                                    .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [prefixQuery])
                                    .orWhereRaw("search_vector @@ to_tsquery('english', ?)", [orQuery]);
                            });
                        } else {
                            // Fall back to websearch_to_tsquery for single-term or empty search
                            sub.whereRaw("search_vector @@ websearch_to_tsquery('english', ?)", [search]);
                        }
                    });
            });
        }

        // Filter by user email (partial, case-insensitive)
        if (email) {
            query = query.where('history_search_sessions.user_email', 'ilike', `%${email}%`);
        }

        // Filter sessions updated on or after the start date
        if (startDate) {
            query = query.where('history_search_sessions.updated_at', '>=', startDate);
        }

        // Filter sessions updated on or before the end date (extended to end of day)
        if (endDate) {
            query = query.where('history_search_sessions.updated_at', '<=', `${endDate} 23:59:59`);
        }

        // Apply feedback filter
        query = this.applyFeedbackFilter(query, 'search', 'history_search_sessions.session_id', feedbackFilter);

        return await query;
    }

    /**
     * @description Retrieve all search records for a specific search session ordered chronologically.
     * Enriches each record with feedback_thumbup and feedback_comment from answer_feedback.
     * @param {string} sessionId - The unique session identifier
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback queries
     * @returns {Promise<any[]>} Array of search records for the session with feedback fields
     */
    async getSearchSessionDetails(sessionId: string, tenantId?: string) {
        // Query to get all search entries for the session
        const records = await ModelFactory.historySearchRecord.getKnex()
            .from('history_search_records')
            .select('*')
            .where('session_id', sessionId)
            .orderBy('created_at', 'asc');

        // Query feedback records for this search session (tenant-scoped if provided)
        let feedbackQuery = db('answer_feedback')
            .where('source', 'search')
            .where('source_id', sessionId)
            .select('message_id', 'thumbup', 'comment')
        if (tenantId) {
            feedbackQuery = feedbackQuery.where('tenant_id', tenantId)
        }
        const feedbackRecords = await feedbackQuery

        // Build a lookup map from message_id to feedback data
        const feedbackMap = new Map(feedbackRecords.map((f: any) => [f.message_id, f]))

        // Merge feedback into search records by matching message_id to id
        return records.map((record: any) => ({
            ...record,
            feedback_thumbup: feedbackMap.get(record.id)?.thumbup ?? null,
            feedback_comment: feedbackMap.get(record.id)?.comment ?? null,
        }))
    }

    /**
     * @description Retrieve paginated agent run history with feedback counts.
     * Joins agent_runs with agents table for agent name, enriches with feedback subqueries.
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Search query to filter by agent name or input text
     * @param {string} email - Filter by triggering user email (partial match)
     * @param {string} startDate - Lower bound date filter (inclusive)
     * @param {string} endDate - Upper bound date filter (inclusive, extended to end of day)
     * @param {FeedbackFilter} [feedbackFilter] - Optional feedback status filter
     * @returns {Promise<any[]>} Paginated array of agent run summaries with feedback counts
     */
    async getAgentRunHistory(
        page: number,
        limit: number,
        search: string,
        email: string,
        startDate: string,
        endDate: string,
        feedbackFilter?: FeedbackFilter,
        tenantId?: string
    ) {
        // Calculate pagination offset
        const offset = (page - 1) * limit

        let query = db('agent_runs')
            .leftJoin('agents', 'agent_runs.agent_id', 'agents.id')
            .leftJoin('users', 'agent_runs.triggered_by', 'users.id')
            .select(
                'agent_runs.id as run_id',
                'agents.title as agent_name',
                'agent_runs.agent_id',
                'agent_runs.status',
                'agent_runs.input',
                'agent_runs.output',
                'agent_runs.started_at',
                'agent_runs.completed_at',
                'agent_runs.duration_ms',
                'users.email as user_email',
            )
            .orderBy('agent_runs.created_at', 'desc')
            .limit(limit)
            .offset(offset)

        // Scope agent runs to the current tenant via the agents table
        if (tenantId) {
            query = query.where('agents.tenant_id', tenantId)
        }

        // Filter by agent name or input text
        if (search) {
            query = query.where(builder => {
                builder.where('agents.title', 'ilike', `%${search}%`)
                    .orWhere('agent_runs.input', 'ilike', `%${search}%`)
            })
        }

        // Filter by triggering user email
        if (email) {
            query = query.where('users.email', 'ilike', `%${email}%`)
        }

        // Date range filters on run start time
        if (startDate) {
            query = query.where('agent_runs.started_at', '>=', startDate)
        }
        if (endDate) {
            query = query.where('agent_runs.started_at', '<=', `${endDate} 23:59:59`)
        }

        // Apply feedback filter before pagination
        query = this.applyFeedbackFilter(query, 'agent', 'agent_runs.id::text', feedbackFilter)
        const runs = await query
        if (runs.length === 0) return []

        const runIds = runs.map((r: any) => r.run_id)
        const feedbackAgg = this.buildFeedbackAggregate('agent', tenantId)
            .whereIn('af.source_id', runIds as string[])

        const feedbackRows = await feedbackAgg
        const feedbackMap = new Map(
            feedbackRows.map((row: any) => [row.source_id, { positive_count: Number(row.positive_count ?? 0), negative_count: Number(row.negative_count ?? 0) }])
        )

        return runs.map((run: any) => {
            const feedback = feedbackMap.get(run.run_id) ?? { positive_count: 0, negative_count: 0 }
            return { ...run, ...feedback }
        })
    }

    /**
     * @description Retrieve a single agent run with its steps and associated feedback records.
     * @param {string} runId - UUID of the agent run
     * @param {string} [tenantId] - Optional tenant ID for scoping feedback and agent queries
     * @returns {Promise<{ run: any, steps: any[], feedback: any[] } | null>} Run details with steps and feedback
     */
    async getAgentRunDetails(runId: string, tenantId?: string) {
        // Fetch the run record with agent name, optionally scoped to tenant
        let runQuery = db('agent_runs')
            .leftJoin('agents', 'agent_runs.agent_id', 'agents.id')
            .leftJoin('users', 'agent_runs.triggered_by', 'users.id')
            .select(
                'agent_runs.*',
                'agents.title as agent_name',
                'users.email as user_email'
            )
            .where('agent_runs.id', runId)
        // Scope to tenant via the agents table
        if (tenantId) {
            runQuery = runQuery.where('agents.tenant_id', tenantId)
        }
        const run = await runQuery.first()

        if (!run) return null

        // Fetch run steps ordered by execution sequence
        const steps = await db('agent_run_steps')
            .where('run_id', runId)
            .orderBy('started_at', 'asc')

        // Fetch feedback records for this agent run (tenant-scoped if provided)
        let feedbackQuery = db('answer_feedback')
            .where('source', 'agent')
            .where('source_id', runId)
            .orderBy('created_at', 'desc')
        if (tenantId) {
            feedbackQuery = feedbackQuery.where('tenant_id', tenantId)
        }
        const feedback = await feedbackQuery

        return { run, steps, feedback }
    }

    /**
     * @description Retrieve paginated system-level chat sessions joined with user details and aggregated messages as JSON
     * @param {number} page - Page number (1-based)
     * @param {number} limit - Maximum items per page
     * @param {string} search - Search query to filter by session title, user email, display name, or message content
     * @returns {Promise<any[]>} Array of system chat session records with embedded messages
     */
    async getSystemChatHistory(
        page: number,
        limit: number,
        search: string
    ) {
        // Build base query joining chat_sessions with users
        let query = ModelFactory.chatSession.getKnex()
            .from('chat_sessions')
            .leftJoin('users', 'chat_sessions.user_id', 'users.id')
            .select(
                'chat_sessions.*',
                'users.email as user_email',
                'users.display_name as user_name',
                // Subquery to aggregate chat messages as JSON array
                (ModelFactory.chatSession.getKnex().client as any).raw(`
                    COALESCE(
                        (
                            SELECT json_agg(json_build_object(
                                'id', cm.id,
                                'role', cm.role,
                                'content', cm.content,
                                'timestamp', cm.timestamp
                            ) ORDER BY cm.timestamp ASC)
                            FROM chat_messages cm
                            WHERE cm.session_id = chat_sessions.id
                        ),
                        '[]'
                    ) as messages
                `)
            )
            .orderBy('chat_sessions.updated_at', 'desc')
            .limit(limit)
            .offset((page - 1) * limit);

        // Apply search filter if provided
        if (search) {
            // Filter by session title, user email, display name, or message content
            query = query.where(builder => {
                builder.where('chat_sessions.title', 'ilike', `%${search}%`)
                    .orWhere('users.email', 'ilike', `%${search}%`)
                    .orWhere('users.display_name', 'ilike', `%${search}%`)
                    // Exists subquery for message content search
                    .orWhereExists(function () {
                        this.select('*')
                            .from('chat_messages')
                            .whereRaw('chat_messages.session_id = chat_sessions.id')
                            .andWhere('content', 'ilike', `%${search}%`);
                    });
            });
        }

        // Execute query and return results
        return await query;
    }
}

/** Singleton instance of AdminHistoryService */
export const adminHistoryService = new AdminHistoryService();
