/**
 * @description Adds upstream RAGFlow columns: `release` on user_canvas_version
 *   and `version_title` on api_4_conversation.
 */

import type { Knex } from 'knex'

/**
 * @description Add release boolean to user_canvas_version and version_title string to api_4_conversation
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // Add release boolean column with index for filtering published versions
  const hasRelease = await knex.schema.hasColumn('user_canvas_version', 'release')
  if (!hasRelease) {
    await knex.schema.alterTable('user_canvas_version', (table) => {
      table.boolean('release').notNullable().defaultTo(false).index()
    })
  }

  // Add version_title for display purposes in API conversations
  const hasVersionTitle = await knex.schema.hasColumn('api_4_conversation', 'version_title')
  if (!hasVersionTitle) {
    await knex.schema.alterTable('api_4_conversation', (table) => {
      table.string('version_title', 255).nullable()
    })
  }
}

/**
 * @description Remove the columns added in the up migration
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_canvas_version', (table) => {
    table.dropColumn('release')
  })

  await knex.schema.alterTable('api_4_conversation', (table) => {
    table.dropColumn('version_title')
  })
}
