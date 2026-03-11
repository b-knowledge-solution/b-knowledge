
import type { Knex } from 'knex'

/**
 * Add RBAC access control to chat dialogs.
 * Adds is_public flag to chat_dialogs and creates chat_dialog_access junction table.
 * @param knex - Knex instance
 */
export async function up(knex: Knex): Promise<void> {
  // Add is_public boolean column to chat_dialogs table
  await knex.schema.alterTable('chat_dialogs', (table) => {
    table.boolean('is_public').defaultTo(false)
  })

  // Create chat_dialog_access junction table for user/team access grants
  await knex.schema.createTable('chat_dialog_access', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Reference to the dialog being shared
    table.uuid('dialog_id').notNullable().references('id').inTable('chat_dialogs').onDelete('CASCADE')
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
    table.unique(['dialog_id', 'entity_type', 'entity_id'])
  })

  // Index on dialog_id for fast lookups by dialog
  await knex.schema.alterTable('chat_dialog_access', (table) => {
    table.index('dialog_id', 'idx_chat_dialog_access_dialog_id')
    // Composite index for querying accessible dialogs by entity
    table.index(['entity_type', 'entity_id'], 'idx_chat_dialog_access_entity')
  })
}

/**
 * Rollback: remove chat_dialog_access table and is_public column.
 * @param knex - Knex instance
 */
export async function down(knex: Knex): Promise<void> {
  // Drop the junction table first (has FK to chat_dialogs)
  await knex.schema.dropTableIfExists('chat_dialog_access')

  // Remove is_public column from chat_dialogs
  await knex.schema.alterTable('chat_dialogs', (table) => {
    table.dropColumn('is_public')
  })
}
