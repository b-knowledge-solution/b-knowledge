/**
 * @fileoverview Standardize ALL UUIDs to 32-char hex (no hyphens) across the entire database.
 *
 * Converts every `uuid` type column to `text`, strips hyphens from all existing
 * UUID values, and replaces `gen_random_uuid()` defaults with
 * `REPLACE(gen_random_uuid()::TEXT, '-', '')` so new rows also get 32-char hex.
 *
 * This eliminates the format mismatch between Node.js (36-char with hyphens) and
 * Python Peewee (32-char hex), removing all `.replace(/-/g, '')` calls from the
 * application code.
 *
 * @module migrations/20260323120000_standardize_uuid_format
 */

import type { Knex } from 'knex'

/**
 * @description Strip hyphens from a UUID column in-place
 * @param {Knex} knex - Knex instance
 * @param {string} table - Table name
 * @param {string} column - Column to strip hyphens from
 */
async function stripHyphens(knex: Knex, table: string, column: string): Promise<void> {
  await knex.raw(
    `UPDATE "${table}" SET "${column}" = REPLACE("${column}"::TEXT, '-', '') WHERE "${column}" IS NOT NULL AND "${column}"::TEXT LIKE '%-%'`
  )
}

/**
 * @description Convert a uuid column to text, strip hyphens, set new default
 * @param {Knex} knex - Knex instance
 * @param {string} table - Table name
 * @param {string} column - Column name (typically 'id')
 */
async function convertUuidColumn(knex: Knex, table: string, column: string): Promise<void> {
  await knex.raw(`ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT`)
  await knex.raw(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE TEXT USING "${column}"::TEXT`)
  await stripHyphens(knex, table, column)
}

/** @description The 32-char hex default expression for new rows */
const HEX_UUID_DEFAULT = "REPLACE(gen_random_uuid()::TEXT, '-', '')"

export async function up(knex: Knex): Promise<void> {
  // ══════════════════════════════════════════════════════════════════════
  // A) Tables using native uuid type → convert to text + strip hyphens
  // ══════════════════════════════════════════════════════════════════════

  // Chat module
  const uuidTables = [
    'chat_assistants',
    'chat_assistant_access',
    'chat_embed_tokens',
    'chat_files',
    'search_apps',
    'search_app_access',
    'search_embed_tokens',
    'broadcast_messages',
    'history_chat_sessions',
    'history_chat_messages',
    'history_search_sessions',
    'history_search_records',
    // RAG shared tables
    'datasets',
    'documents',
    'model_providers',
    'connectors',
    'sync_logs',
  ]

  for (const table of uuidTables) {
    await convertUuidColumn(knex, table, 'id')
  }

  // ══════════════════════════════════════════════════════════════════════
  // B) uuid-typed FK columns (non-id) → convert to text + strip hyphens
  // ══════════════════════════════════════════════════════════════════════

  const uuidFkColumns: [string, string][] = [
    // chat_assistant_access
    ['chat_assistant_access', 'assistant_id'],
    ['chat_assistant_access', 'entity_id'],
    // chat_embed_tokens
    ['chat_embed_tokens', 'assistant_id'],
    // chat_sessions
    ['chat_sessions', 'dialog_id'],
    // chat_files
    ['chat_files', 'session_id'],
    // search_app_access
    ['search_app_access', 'app_id'],
    ['search_app_access', 'entity_id'],
    // search_embed_tokens
    ['search_embed_tokens', 'app_id'],
    // user_dismissed_broadcasts
    ['user_dismissed_broadcasts', 'broadcast_id'],
    // datasets
    ['datasets', 'parent_dataset_id'],
    // documents
    ['documents', 'dataset_id'],
    ['documents', 'parent_id'],
    // sync_logs
    ['sync_logs', 'connector_id'],
    // project_datasets
    ['project_datasets', 'dataset_id'],
    // project_sync_configs
    ['project_sync_configs', 'dataset_id'],
    // answer_feedback
    ['answer_feedback', 'dataset_id'],
    // query_log
    ['query_log', 'dataset_id'],
  ]

  for (const [table, column] of uuidFkColumns) {
    // Some FK columns may already be text — use a safe type cast
    try {
      await knex.raw(`ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE TEXT USING "${column}"::TEXT`)
    } catch {
      // Column is already text — skip type conversion
    }
    await stripHyphens(knex, table, column)
  }

  // ══════════════════════════════════════════════════════════════════════
  // C) text columns with gen_random_uuid()::TEXT default → strip existing
  //    hyphens and update default to produce 32-char hex
  // ══════════════════════════════════════════════════════════════════════

  const textUuidTables = [
    'users',
    'teams',
    'chat_sessions',
    'chat_messages',
    'glossary_tasks',
    'glossary_keywords',
    'projects',
    'project_permissions',
    'document_categories',
    'document_category_versions',
    'document_resources',
    'document_resource_versions',
    'project_share_links',
    'project_share_link_accesses',
    'project_datasets',
    'project_sync_configs',
    'answer_feedback',
    'platform_policies',
    'query_log',
    'api_keys',
    'agents',
    'agent_runs',
    'agent_run_steps',
    'agent_tool_credentials',
    'agent_templates',
    'memories',
  ]

  for (const table of textUuidTables) {
    // Strip hyphens from existing data
    await stripHyphens(knex, table, 'id')
    // Update default to produce 32-char hex for new rows
    await knex.raw(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT ${HEX_UUID_DEFAULT}`)
  }

  // ══════════════════════════════════════════════════════════════════════
  // D) text FK columns referencing text UUID tables → strip hyphens
  // ══════════════════════════════════════════════════════════════════════

  const textFkColumns: [string, string][] = [
    // user references
    ['datasets', 'created_by'],
    ['datasets', 'updated_by'],
    ['documents', 'created_by'],
    ['documents', 'updated_by'],
    // agent references
    ['agent_runs', 'agent_id'],
    ['agent_run_steps', 'run_id'],
    // memory references
    ['memories', 'created_by'],
    // project references
    ['project_permissions', 'project_id'],
    ['project_permissions', 'user_id'],
    ['project_datasets', 'project_id'],
    ['project_sync_configs', 'project_id'],
    // chat references
    ['chat_messages', 'session_id'],
    // user_tenant
    ['user_tenant', 'id'],
  ]

  for (const [table, column] of textFkColumns) {
    await stripHyphens(knex, table, column)
  }

  // ══════════════════════════════════════════════════════════════════════
  // E) Set hex default on converted uuid tables (section A)
  // ══════════════════════════════════════════════════════════════════════

  for (const table of uuidTables) {
    await knex.raw(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT ${HEX_UUID_DEFAULT}`)
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert is complex — re-add hyphens and convert back to uuid type
  // This is best-effort for development rollback, not production
  const reformat = async (table: string, column: string) => {
    await knex.raw(`
      UPDATE "${table}"
      SET "${column}" = CONCAT(
        SUBSTR("${column}", 1, 8), '-',
        SUBSTR("${column}", 9, 4), '-',
        SUBSTR("${column}", 13, 4), '-',
        SUBSTR("${column}", 17, 4), '-',
        SUBSTR("${column}", 21, 12)
      )
      WHERE "${column}" IS NOT NULL
        AND LENGTH("${column}") = 32
        AND "${column}" NOT LIKE '%-%'
    `)
  }

  // Revert uuid-type tables back
  const uuidTables = [
    'chat_assistants', 'chat_assistant_access', 'chat_embed_tokens', 'chat_files',
    'search_apps', 'search_app_access', 'search_embed_tokens',
    'broadcast_messages',
    'history_chat_sessions', 'history_chat_messages', 'history_search_sessions', 'history_search_records',
    'datasets', 'documents', 'model_providers', 'connectors', 'sync_logs',
  ]

  for (const table of uuidTables) {
    await reformat(table, 'id')
    await knex.raw(`ALTER TABLE "${table}" ALTER COLUMN "id" TYPE UUID USING "id"::UUID`)
    await knex.raw(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`)
  }

  // Revert text UUID tables back to gen_random_uuid()::TEXT default
  const textUuidTables = [
    'users', 'teams', 'chat_sessions', 'chat_messages',
    'glossary_tasks', 'glossary_keywords',
    'projects', 'project_permissions', 'document_categories', 'document_category_versions',
    'document_resources', 'document_resource_versions',
    'project_share_links', 'project_share_link_accesses',
    'project_datasets', 'project_sync_configs',
    'answer_feedback', 'platform_policies', 'query_log', 'api_keys',
    'agents', 'agent_runs', 'agent_run_steps', 'agent_tool_credentials', 'agent_templates',
    'memories',
  ]

  for (const table of textUuidTables) {
    await reformat(table, 'id')
    await knex.raw(`ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::TEXT`)
  }
}
