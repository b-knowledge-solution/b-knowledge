/**
 * @fileoverview Add missing indexes for CRUD operations and FK column lookups.
 * @description Covers foreign key columns without indexes (PG does not auto-index FK sources),
 *   composite indexes for common query patterns, and analytics lookup columns.
 *   Complements the PR #34 migration which focused on history/analytics paths.
 */

import type { Knex } from 'knex'

/**
 * @description Create indexes that accelerate CRUD operations, FK cascade lookups,
 *   and remaining analytics query paths.
 * @param {Knex} knex - Knex migration context
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // sync_logs.kb_id — frequently queried for KB-scoped sync history
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_sync_logs_kb_id ON sync_logs(kb_id)')

  // sync_logs.(connector_id, created_at DESC) — recent syncs per connector, pagination
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_sync_logs_connector_created ON sync_logs(connector_id, created_at DESC)')

  // query_log.source_id — dashboard analytics filter by source entity
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_query_log_source_id ON query_log(source_id)')

  // connectors.created_by — FK column without auto-index; needed for cascade and ownership queries
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_connectors_created_by ON connectors(created_by)')

  // document_categories.dataset_id — FK column without auto-index; needed for cascade on dataset delete
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_document_categories_dataset_id ON document_categories(dataset_id)')

  // document_categories.created_by — ownership-scoped category queries
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_document_categories_created_by ON document_categories(created_by)')

  // agent_runs.(agent_id, created_at DESC) — agent execution history with recency sort
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_created ON agent_runs(agent_id, created_at DESC)')
}

/**
 * @description Drop indexes introduced by this migration.
 * @param {Knex} knex - Knex migration context
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_agent_runs_agent_created')
  await knex.raw('DROP INDEX IF EXISTS idx_document_categories_created_by')
  await knex.raw('DROP INDEX IF EXISTS idx_document_categories_dataset_id')
  await knex.raw('DROP INDEX IF EXISTS idx_connectors_created_by')
  await knex.raw('DROP INDEX IF EXISTS idx_query_log_source_id')
  await knex.raw('DROP INDEX IF EXISTS idx_sync_logs_connector_created')
  await knex.raw('DROP INDEX IF EXISTS idx_sync_logs_kb_id')
}
