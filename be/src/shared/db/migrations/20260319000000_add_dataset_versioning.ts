/**
 * @fileoverview Add dataset versioning columns to the datasets table.
 * @description Extends the datasets table with version tracking fields to support
 * the version-as-dataset model where each document version creates a new dataset
 * that inherits parent settings and uses pagerank = version_number for recency boost.
 *
 * New columns:
 * - parent_dataset_id: links version datasets to their parent
 * - version_number: auto-incrementing version counter (null for parent datasets)
 * - change_summary: optional user-provided or auto-generated version description
 * - version_created_by: tracks which user created this version
 * - metadata_config: JSONB template for document-level metadata extraction schema
 */
import type { Knex } from 'knex'

/**
 * @description Add versioning columns and indexes to the datasets table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('datasets', (table) => {
    // Parent dataset reference — NULL for parent datasets, set for version datasets
    table.uuid('parent_dataset_id').nullable().references('id').inTable('datasets').onDelete('SET NULL')

    // Version number — NULL for parent datasets, 1+ for version datasets
    table.integer('version_number').nullable()

    // Optional change summary — user-provided or auto-generated on version creation
    table.text('change_summary').nullable()

    // User who created this version — tracks authorship for version metadata display
    table.text('version_created_by').nullable().references('id').inTable('users').onDelete('SET NULL')

    // Document-level metadata extraction schema template (JSONB)
    table.jsonb('metadata_config').defaultTo('{}')
  })

  // Partial index for efficient version listing — only version datasets have parent_dataset_id
  await knex.raw(`
    CREATE INDEX idx_datasets_parent_id
    ON datasets(parent_dataset_id)
    WHERE parent_dataset_id IS NOT NULL
  `)

  // Composite index for version ordering within a parent
  await knex.raw(`
    CREATE INDEX idx_datasets_version
    ON datasets(parent_dataset_id, version_number)
  `)
}

/**
 * @description Remove versioning columns and indexes from the datasets table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  // Drop indexes before dropping columns
  await knex.raw('DROP INDEX IF EXISTS idx_datasets_version')
  await knex.raw('DROP INDEX IF EXISTS idx_datasets_parent_id')

  await knex.schema.alterTable('datasets', (table) => {
    table.dropColumn('metadata_config')
    table.dropColumn('version_created_by')
    table.dropColumn('change_summary')
    table.dropColumn('version_number')
    table.dropColumn('parent_dataset_id')
  })
}
