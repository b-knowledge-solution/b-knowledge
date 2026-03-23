import type { Knex } from 'knex'

/**
 * @description Adds upstream RAGFlow columns: release flag for canvas versions
 * and version_title for conversation sessions.
 */
export async function up(knex: Knex): Promise<void> {
  // Add release flag to canvas versions for published version tracking
  await knex.schema.alterTable('user_canvas_version', (table) => {
    table.boolean('release').notNullable().defaultTo(false).index()
  })

  // Add version title to conversation sessions for agent version labeling
  await knex.schema.alterTable('api_4_conversation', (table) => {
    table.string('version_title', 255).nullable()
  })
}

/**
 * @description Reverts upstream RAGFlow columns: removes release and version_title.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_canvas_version', (table) => {
    table.dropColumn('release')
  })
  await knex.schema.alterTable('api_4_conversation', (table) => {
    table.dropColumn('version_title')
  })
}
