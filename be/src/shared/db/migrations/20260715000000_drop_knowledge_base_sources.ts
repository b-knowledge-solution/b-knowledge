/**
 * @fileoverview Migration to drop knowledge_base_sources table.
 * @description The knowledge-base module has been removed; this table is no longer used.
 */
import type { Knex } from 'knex'

/**
 * Drop the knowledge_base_sources table.
 * @param knex - Knex instance
 * @returns Promise<void>
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('knowledge_base_sources')
}

/**
 * Re-create the knowledge_base_sources table for rollback.
 * @param knex - Knex instance
 * @returns Promise<void>
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.createTable('knowledge_base_sources', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    table.text('share_id').unique().notNullable()
    table.text('name').notNullable()
    table.text('description')
    table.text('type').notNullable().defaultTo('chat')
    table.text('created_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    table.index('share_id')
  })
}
