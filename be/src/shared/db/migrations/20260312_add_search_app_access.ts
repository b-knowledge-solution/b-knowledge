
import type { Knex } from 'knex'

/**
 * Add RBAC access control to search apps.
 * Adds is_public flag to search_apps and creates search_app_access junction table.
 * @param knex - Knex instance
 */
export async function up(knex: Knex): Promise<void> {
  // Add is_public boolean column to search_apps table
  await knex.schema.alterTable('search_apps', (table) => {
    table.boolean('is_public').defaultTo(false)
  })

  // Create search_app_access junction table for user/team access grants
  await knex.schema.createTable('search_app_access', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Reference to the search app being shared
    table.uuid('app_id').notNullable().references('id').inTable('search_apps').onDelete('CASCADE')
    // Entity type: 'user' or 'team'
    table.string('entity_type', 16).notNullable()
    // UUID of the user or team granted access
    table.uuid('entity_id').notNullable()
    // User who created this access entry
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    // Timestamp of record creation
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    // Enforce valid entity types via CHECK constraint
    table.check('?? IN (?, ?)', ['entity_type', 'user', 'team'])
    // Prevent duplicate access entries
    table.unique(['app_id', 'entity_type', 'entity_id'])
  })

  // Index on app_id for fast lookups by search app
  await knex.schema.alterTable('search_app_access', (table) => {
    table.index('app_id', 'idx_search_app_access_app_id')
    // Composite index for querying accessible apps by entity
    table.index(['entity_type', 'entity_id'], 'idx_search_app_access_entity')
  })
}

/**
 * Rollback: remove search_app_access table and is_public column.
 * @param knex - Knex instance
 */
export async function down(knex: Knex): Promise<void> {
  // Drop the junction table first (has FK to search_apps)
  await knex.schema.dropTableIfExists('search_app_access')

  // Remove is_public column from search_apps
  await knex.schema.alterTable('search_apps', (table) => {
    table.dropColumn('is_public')
  })
}
