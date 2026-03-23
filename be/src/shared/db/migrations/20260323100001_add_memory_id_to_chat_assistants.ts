/**
 * @description Migration to add memory_id FK column to chat_assistants table.
 *   Links chat assistants to memory pools for automatic memory extraction and injection.
 *   Uses ON DELETE SET NULL so deleting a memory pool does not break the assistant.
 */
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add nullable memory_id column referencing the memories table
  await knex.schema.alterTable('chat_assistants', (table) => {
    table
      .uuid('memory_id')
      .nullable()
      .references('id')
      .inTable('memories')
      .onDelete('SET NULL')
      .comment('Optional link to a memory pool for auto-extraction and context injection')
  })
}

export async function down(knex: Knex): Promise<void> {
  // Remove the memory_id column
  await knex.schema.alterTable('chat_assistants', (table) => {
    table.dropColumn('memory_id')
  })
}
