/**
 * @fileoverview Adds delta sync tracking fields to document and sync_logs tables.
 * @description Enables delta sync for connector-based document ingestion:
 *   - source_doc_id: external source's unique document identifier for cross-sync matching
 *   - source_updated_at: last-modified timestamp from the external source for change detection
 *   - docs_skipped / docs_deleted: sync log counters for unchanged and orphaned documents
 */
import type { Knex } from 'knex'

/**
 * @description Add delta sync tracking columns to document table and sync metrics to sync_logs.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // Add source tracking fields to document table for delta sync change detection
  await knex.schema.alterTable('document', (table) => {
    // External source's unique document ID (e.g., Confluence page ID, GitHub file path)
    // Used to match source documents to DB documents across sync cycles
    table.string('source_doc_id', 512).nullable().index()
    // Last-modified timestamp from the external source, stored at ingest time
    // Compared against source on next sync to detect modifications
    table.timestamp('source_updated_at').nullable()
  })

  // Add delta sync counters to sync_logs for reporting skipped and deleted documents
  await knex.schema.alterTable('sync_logs', (table) => {
    // Number of unchanged documents skipped during this sync cycle
    table.integer('docs_skipped').notNullable().defaultTo(0)
    // Number of orphaned documents removed (present in KB but absent from source)
    table.integer('docs_deleted').notNullable().defaultTo(0)
  })
}

/**
 * @description Remove delta sync tracking columns from document and sync_logs tables.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('document', (table) => {
    table.dropColumn('source_doc_id')
    table.dropColumn('source_updated_at')
  })

  await knex.schema.alterTable('sync_logs', (table) => {
    table.dropColumn('docs_skipped')
    table.dropColumn('docs_deleted')
  })
}
