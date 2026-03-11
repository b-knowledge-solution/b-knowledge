
/**
 * @fileoverview Migration to create sync module tables (connectors, sync_logs).
 * @description Supports the new architecture where BE handles external data
 *   source syncing, stores raw files to MinIO, then triggers advance-rag parsing.
 */
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Connectors table - external data source connection configurations
  await knex.schema.createTable('connectors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.string('name', 255).notNullable()
    table.string('source_type', 64).notNullable()
    table.string('kb_id', 255).notNullable().references('id').inTable('knowledgebase').onDelete('CASCADE')
    table.jsonb('config').defaultTo('{}')
    table.text('description')
    table.string('schedule', 128)
    table.string('status', 16).defaultTo('active')
    table.timestamp('last_synced_at')
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.text('updated_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)

    // Index for filtering connectors by knowledge base
    table.index('kb_id')
    // Index for listing connectors by status
    table.index('status')
  })

  // Sync logs table - tracks individual sync task executions
  await knex.schema.createTable('sync_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('connector_id').notNullable().references('id').inTable('connectors').onDelete('CASCADE')
    table.string('kb_id', 255).notNullable()
    table.string('status', 16).defaultTo('pending')
    table.integer('docs_synced').defaultTo(0)
    table.integer('docs_failed').defaultTo(0)
    table.integer('progress').defaultTo(0)
    table.text('message')
    table.timestamp('started_at')
    table.timestamp('finished_at')
    table.timestamps(true, true)

    // Index for listing logs by connector
    table.index('connector_id')
    // Index for filtering by status
    table.index('status')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sync_logs')
  await knex.schema.dropTableIfExists('connectors')
}
