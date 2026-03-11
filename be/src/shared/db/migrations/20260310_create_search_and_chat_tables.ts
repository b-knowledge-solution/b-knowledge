import type { Knex } from 'knex'

/**
 * Create search_apps and chat_dialogs tables, and add columns to existing chat tables.
 * @param knex - Knex instance
 */
export async function up(knex: Knex): Promise<void> {
  // Create search_apps table for saved search configurations
  await knex.schema.createTable('search_apps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 128).notNullable()
    table.text('description')
    table.jsonb('dataset_ids').defaultTo('[]')
    table.jsonb('search_config').defaultTo('{}')
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.text('updated_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)
  })

  // Create chat_dialogs table for RAGFlow dialog (chat assistant) configurations
  await knex.schema.createTable('chat_dialogs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 128).notNullable()
    table.text('description')
    table.string('icon', 256)
    table.jsonb('kb_ids').defaultTo('[]')
    table.string('llm_id', 128)
    table.jsonb('prompt_config').defaultTo('{}')
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.text('updated_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)
  })

  // Add dialog_id to existing chat_sessions table
  await knex.schema.alterTable('chat_sessions', (table) => {
    table.uuid('dialog_id').nullable()
  })

  // Add citations JSONB and message_id columns to chat_messages table
  await knex.schema.alterTable('chat_messages', (table) => {
    table.jsonb('citations').nullable()
    table.string('message_id', 64).nullable()
  })
}

/**
 * Rollback: drop new tables and added columns.
 * @param knex - Knex instance
 */
export async function down(knex: Knex): Promise<void> {
  // Remove added columns from chat_messages
  await knex.schema.alterTable('chat_messages', (table) => {
    table.dropColumn('citations')
    table.dropColumn('message_id')
  })

  // Remove dialog_id from chat_sessions
  await knex.schema.alterTable('chat_sessions', (table) => {
    table.dropColumn('dialog_id')
  })

  await knex.schema.dropTableIfExists('chat_dialogs')
  await knex.schema.dropTableIfExists('search_apps')
}
