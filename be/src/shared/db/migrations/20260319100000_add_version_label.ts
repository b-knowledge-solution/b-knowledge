/**
 * @fileoverview Add version_label column to the datasets table.
 * @description Extends versioning support with a custom display label so users
 * can enter semantic version strings (e.g., "1.2.0", "Q1 Release") instead of
 * relying solely on auto-incrementing v{N} badges. The integer version_number
 * is kept for pagerank boost; version_label provides display flexibility.
 *
 * New column:
 * - version_label: optional text label for human-friendly version display
 */
import type { Knex } from 'knex'

/**
 * @description Add version_label column to the datasets table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('datasets', (table) => {
    // Custom display label for version datasets — NULL for parent or unlabeled versions
    table.text('version_label').nullable()
  })
}

/**
 * @description Remove version_label column from the datasets table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('datasets', (table) => {
    table.dropColumn('version_label')
  })
}
