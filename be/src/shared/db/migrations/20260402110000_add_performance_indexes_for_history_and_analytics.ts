/**
 * @fileoverview Add performance-focused indexes for history/admin/analytics query paths.
 * @description Adds composite and sort-friendly indexes for high-volume tables used by
 *   admin history, dashboard analytics, and user history endpoints.
 */

import { Knex } from 'knex'

/**
 * @description Create indexes that reduce full scans and expensive sorts on large datasets.
 * @param {Knex} knex - Knex migration context
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // Accelerate history session listing sorted by recency with optional email filters
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_history_chat_sessions_updated_at ON history_chat_sessions(updated_at DESC)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_history_chat_sessions_email_updated ON history_chat_sessions(user_email, updated_at DESC)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_history_search_sessions_updated_at ON history_search_sessions(updated_at DESC)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_history_search_sessions_email_updated ON history_search_sessions(user_email, updated_at DESC)')

  // Accelerate internal session listing and ownership checks
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_created ON chat_sessions(user_id, created_at DESC)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_chat_messages_session_timestamp ON chat_messages(session_id, timestamp ASC)')

  // Accelerate feedback aggregation/filtering by tenant/source/source_id and recency
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_answer_feedback_tenant_source_source_id ON answer_feedback(tenant_id, source, source_id)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_answer_feedback_tenant_created_at ON answer_feedback(tenant_id, created_at DESC)')

  // Accelerate analytics grouping/ranking by tenant and query text
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_query_log_tenant_query ON query_log(tenant_id, query)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_query_log_tenant_created_source ON query_log(tenant_id, created_at DESC, source)')

  // Accelerate agent history listing sorted by creation time
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at DESC)')
}

/**
 * @description Drop performance indexes introduced by this migration.
 * @param {Knex} knex - Knex migration context
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_agent_runs_created_at')

  await knex.raw('DROP INDEX IF EXISTS idx_query_log_tenant_created_source')
  await knex.raw('DROP INDEX IF EXISTS idx_query_log_tenant_query')

  await knex.raw('DROP INDEX IF EXISTS idx_answer_feedback_tenant_created_at')
  await knex.raw('DROP INDEX IF EXISTS idx_answer_feedback_tenant_source_source_id')

  await knex.raw('DROP INDEX IF EXISTS idx_chat_messages_session_timestamp')
  await knex.raw('DROP INDEX IF EXISTS idx_chat_sessions_updated_at')
  await knex.raw('DROP INDEX IF EXISTS idx_chat_sessions_user_created')

  await knex.raw('DROP INDEX IF EXISTS idx_history_search_sessions_email_updated')
  await knex.raw('DROP INDEX IF EXISTS idx_history_search_sessions_updated_at')
  await knex.raw('DROP INDEX IF EXISTS idx_history_chat_sessions_email_updated')
  await knex.raw('DROP INDEX IF EXISTS idx_history_chat_sessions_updated_at')
}
