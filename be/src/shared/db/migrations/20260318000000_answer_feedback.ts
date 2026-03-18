/**
 * @fileoverview Migration to create the answer_feedback table.
 * @description Stores user feedback (thumbs up/down) on chat and search answers
 *   with query context and chunk references for retrieval quality correlation.
 */
import type { Knex } from 'knex'

/**
 * @description Create the answer_feedback table with indexes for common query patterns.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('answer_feedback', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Source of the feedback: chat conversation or search app
    table.text('source').notNullable().checkIn(['chat', 'search'])
    // conversation_id for chat, search_app_id for search
    table.text('source_id').notNullable()
    // Chat message ID; null for search feedback
    table.text('message_id').nullable()
    table.text('user_id').notNullable()
    table.boolean('thumbup').notNullable()
    table.text('comment').nullable()
    table.text('query').notNullable()
    table.text('answer').notNullable()
    // Array of { chunk_id, doc_id, score } for retrieval correlation
    table.jsonb('chunks_used').nullable()
    // Langfuse trace ID for observability linking
    table.text('trace_id').nullable()
    table.text('tenant_id').notNullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    // Indexes for common query patterns
    table.index(['source', 'source_id'])
    table.index(['user_id'])
    table.index(['thumbup'])
    table.index(['tenant_id'])
  })
}

/**
 * @description Drop the answer_feedback table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('answer_feedback')
}
