/**
 * @fileoverview Migration to add a pagerank column to the datasets table.
 *
 * The pagerank value allows administrators to boost or de-boost specific
 * datasets in search result ranking. Higher values surface the dataset
 * earlier in combined search results.
 *
 * @module db/migrations/20260316070026_add_pagerank_to_datasets
 */
import type { Knex } from 'knex'

/**
 * @description Add an integer pagerank column to datasets for search ranking control.
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('datasets', (table) => {
    // Default 0 means neutral ranking; positive values boost, negative values suppress
    table.integer('pagerank').defaultTo(0)
  })
}

/**
 * @description Remove the pagerank column from datasets.
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('datasets', (table) => {
    table.dropColumn('pagerank')
  })
}
