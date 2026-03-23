/**
 * @fileoverview Migration to create the memories table for AI memory pools.
 * @description Stores memory pool definitions with bitmask-based memory type selection,
 *   configurable extraction modes, and multi-scope ownership (user, agent, team).
 */
import type { Knex } from 'knex'

/**
 * @description Create the memories table with indexes for tenant isolation, scope lookup, and creator tracking.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('memories', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Human-readable memory pool name
    table.string('name', 255).notNullable()
    // Optional description of the memory pool's purpose
    table.text('description').nullable()
    // Avatar URL or data URI for UI display
    table.text('avatar').nullable()
    // Bitmask for enabled memory types: RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8 (default 15 = all)
    table.integer('memory_type').notNullable().defaultTo(15)
    // Storage backend: 'table' for OpenSearch flat docs, 'graph' for knowledge graph
    table.string('storage_type', 20).notNullable().defaultTo('table')
    // Maximum memory pool size in bytes (default 5MB per D-07)
    table.integer('memory_size').notNullable().defaultTo(5242880)
    // Strategy for removing old memories when pool is full
    table.string('forgetting_policy', 20).notNullable().defaultTo('FIFO')
    // Per-pool embedding model override (null = use tenant default)
    table.string('embd_id', 255).nullable()
    // Per-pool LLM model override for extraction (null = use tenant default)
    table.string('llm_id', 255).nullable()
    // LLM temperature for extraction calls
    table.float('temperature').notNullable().defaultTo(0.1)
    // Custom system prompt for memory extraction (overrides default prompts)
    table.text('system_prompt').nullable()
    // Custom user prompt template for memory extraction
    table.text('user_prompt').nullable()
    // Extraction timing: batch = post-conversation, realtime = during conversation
    table.string('extraction_mode', 20).notNullable().defaultTo('batch')
    // Access control: 'me' = creator only, 'team' = team-visible
    table.string('permission', 10).notNullable().defaultTo('me')
    // Ownership scope: determines what entity owns this memory pool
    table.string('scope_type', 20).notNullable().defaultTo('user')
    // UUID of the owning entity (user, agent, or team based on scope_type)
    table.uuid('scope_id').nullable()
    // Multi-tenant isolation
    table.string('tenant_id', 255).notNullable()
    // Creator tracking
    table.string('created_by', 255).nullable()
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // CHECK constraints for enum-like string columns
    table.check("storage_type IN ('table', 'graph')", [], 'chk_memories_storage_type')
    table.check("extraction_mode IN ('batch', 'realtime')", [], 'chk_memories_extraction_mode')
    table.check("permission IN ('me', 'team')", [], 'chk_memories_permission')
    table.check("scope_type IN ('user', 'agent', 'team')", [], 'chk_memories_scope_type')

    // Index for tenant-scoped queries
    table.index(['tenant_id'], 'idx_memories_tenant_id')
    // Composite index for scope-based lookups (e.g., all memories for a specific agent)
    table.index(['scope_type', 'scope_id'], 'idx_memories_scope')
    // Index for querying memories by creator
    table.index(['created_by'], 'idx_memories_created_by')
  })
}

/**
 * @description Drop the memories table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('memories')
}
