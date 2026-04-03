/**
 * @fileoverview Adds avatar and empty_response columns to search_apps table.
 * @description Avatar stores an emoji icon (max 64 chars), empty_response stores
 *   a custom message shown when search returns no results.
 */
import type { Knex } from 'knex'

/**
 * @description Add avatar (varchar 64, nullable) and empty_response (text, nullable)
 *   columns to the search_apps table for UI customization.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('search_apps', (table) => {
    // Emoji icon for the search app (e.g. displayed in cards and embed widget)
    table.string('avatar', 64).nullable()
    // Custom message shown when search returns no results
    table.text('empty_response').nullable()
  })
}

/**
 * @description Remove avatar and empty_response columns from search_apps table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('search_apps', (table) => {
    table.dropColumn('avatar')
    table.dropColumn('empty_response')
  })
}
