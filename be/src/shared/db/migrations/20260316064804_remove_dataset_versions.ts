/**
 * @fileoverview Migration to remove deprecated dataset version tables.
 *
 * Drops converter_jobs, document_version_files, and document_versions tables
 * that were part of an earlier versioning approach replaced by the RAG pipeline.
 *
 * @module db/migrations/20260316064804_remove_dataset_versions
 */
import type { Knex } from 'knex'

/**
 * @description Drop deprecated versioning tables that are no longer used by the RAG pipeline.
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // Drop in reverse dependency order to avoid FK constraint errors
  await knex.schema.dropTableIfExists('converter_jobs');
  await knex.schema.dropTableIfExists('document_version_files');
  await knex.schema.dropTableIfExists('document_versions');
}

/**
 * @description Rollback stub — this migration is irreversible because recreating
 * the dropped tables with their original data is not feasible.
 * @param {Knex} _knex - Knex instance (unused)
 * @returns {Promise<void>}
 */
export async function down(_knex: Knex): Promise<void> {
  // Irreversible migration (schema recreating is complex and handled by initial_schema)
  // For safety, we just log a warning or leave it empty so rollbacks don't crash.
  console.warn('Cannot reverse remove_dataset_versions migration automatically.');
}
