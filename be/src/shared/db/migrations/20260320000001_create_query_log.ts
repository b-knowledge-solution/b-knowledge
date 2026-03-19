/**
 * @fileoverview Migration to create the query_log table for analytics.
 * @description Stores search and chat query events with performance metrics
 *   and retrieval quality indicators for observability dashboards.
 */
import type { Knex } from 'knex'

/**
 * @description Create the query_log table with indexes for analytics query patterns.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('query_log', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Source of the query: chat conversation or search app
    table.text('source').notNullable().checkIn(['chat', 'search'])
    // conversation_id for chat, search_app_id for search
    table.text('source_id').notNullable()
    table.text('user_id').notNullable()
    table.text('tenant_id').notNullable()
    // Original query text submitted by the user
    table.text('query').notNullable()
    // Dataset IDs searched (useful for per-dataset analytics)
    table.jsonb('dataset_ids').defaultTo('[]')
    // Number of retrieval results returned
    table.integer('result_count').defaultTo(0)
    // End-to-end response time in milliseconds
    table.integer('response_time_ms').nullable()
    // Average confidence/relevance score across returned chunks
    table.float('confidence_score').nullable()
    // Flag for zero-result or below-threshold retrievals
    table.boolean('failed_retrieval').defaultTo(false)
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    // Indexes for common analytics query patterns
    table.index(['tenant_id', 'created_at'])
    table.index(['tenant_id', 'failed_retrieval'])
    table.index(['source'])
    table.index(['user_id'])
  })
}

/**
 * @description Drop the query_log table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('query_log')
}
