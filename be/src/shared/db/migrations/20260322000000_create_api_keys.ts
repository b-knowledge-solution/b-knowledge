/**
 * @fileoverview Migration to create the api_keys table for external API access.
 * @description Stores hashed API keys for user-scoped external API authentication.
 *   Keys are SHA-256 hashed — the plaintext is only shown once at creation time.
 */
import type { Knex } from 'knex'

/**
 * @description Create the api_keys table with indexes for fast hash lookups and user listing.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('api_keys', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Owner of the API key
    table.text('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    // Human-readable label for identification
    table.text('name').notNullable()
    // First 8 chars of the key for display purposes (e.g. "bk-a1b2c3")
    table.text('key_prefix').notNullable()
    // SHA-256 hash of the full API key — never store plaintext
    table.text('key_hash').notNullable()
    // Permitted API scopes: chat, search, retrieval
    table.jsonb('scopes').notNullable().defaultTo('["chat","search","retrieval"]')
    // Soft toggle for disabling without deletion
    table.boolean('is_active').notNullable().defaultTo(true)
    // Tracks when the key was last used for a request
    table.timestamp('last_used_at', { useTz: true }).nullable()
    // Optional expiration date — null means never expires
    table.timestamp('expires_at', { useTz: true }).nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Fast lookup by key hash during authentication
    table.index(['key_hash'])
    // Fast listing of user's API keys
    table.index(['user_id'])
  })
}

/**
 * @description Drop the api_keys table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('api_keys')
}
