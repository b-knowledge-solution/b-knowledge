import type { Knex } from 'knex'

/**
 * @description Add permissions JSONB column to teams table for team-level permission storage.
 *   Stores an array of permission key strings (e.g. ["datasets.view", "chat.view"]) directly
 *   on the team record, independent of member-level permissions.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('teams', (table) => {
    // Default to empty JSON array so existing teams start with no permissions
    table.jsonb('permissions').notNullable().defaultTo('[]')
  })
}

/**
 * @description Reverse the permissions column addition from teams table
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('teams', (table) => {
    table.dropColumn('permissions')
  })
}
