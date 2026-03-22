/**
 * @fileoverview Migration to create the agent_tool_credentials table.
 * @description Stores encrypted credentials for external tools used by agents.
 *   Credentials are AES-256-CBC encrypted via crypto.service.ts. A NULL agent_id
 *   indicates a tenant-level default credential for that tool type.
 */
import type { Knex } from 'knex'

/**
 * @description Create the agent_tool_credentials table with uniqueness constraint.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('agent_tool_credentials', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Multi-tenant isolation
    table.string('tenant_id', 64).notNullable()
    // NULL = tenant-level default; non-null = agent-specific override
    table.uuid('agent_id').nullable().references('id').inTable('agents').onDelete('CASCADE')
    // Tool identifier (e.g., 'tavily', 'github', 'sql')
    table.string('tool_type', 100).notNullable()
    // Human-readable credential name
    table.string('name', 255).notNullable()
    // AES-256-CBC encrypted credential payload
    table.text('encrypted_credentials').notNullable()
    // Creator tracking
    table.text('created_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Index for listing credentials within a tenant
    table.index(['tenant_id'], 'idx_agent_tool_creds_tenant')
    // Index for listing credentials for a specific agent
    table.index(['agent_id'], 'idx_agent_tool_creds_agent')
  })

  // Unique constraint using COALESCE to handle NULL agent_id in uniqueness check
  await knex.raw(`
    CREATE UNIQUE INDEX idx_agent_tool_creds_unique
    ON agent_tool_credentials (tenant_id, COALESCE(agent_id, '00000000-0000-0000-0000-000000000000'::uuid), tool_type)
  `)
}

/**
 * @description Drop the agent_tool_credentials table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('agent_tool_credentials')
}
