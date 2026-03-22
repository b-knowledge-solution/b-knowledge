/**
 * @fileoverview Migration to create the agents table for AI agent workflows.
 * @description Stores agent definitions with JSONB DSL for workflow graphs,
 *   versioning via parent_id + version_number, and ABAC policy_rules.
 */
import type { Knex } from 'knex'

/**
 * @description Create the agents table with indexes for tenant isolation, versioning, and project lookup.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('agents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Human-readable agent name
    table.string('name', 255).notNullable()
    // Optional long description of agent purpose
    table.text('description').nullable()
    // Avatar URL or data URI
    table.string('avatar', 512).nullable()
    // Execution mode: 'agent' for LLM-driven, 'pipeline' for deterministic DAG
    table.string('mode', 20).notNullable().defaultTo('agent')
    // Lifecycle status: draft agents are not executable
    table.string('status', 20).notNullable().defaultTo('draft')
    // JSONB workflow graph definition (nodes, edges, parameters)
    table.jsonb('dsl').notNullable().defaultTo('{}')
    // DSL schema version for forward compatibility
    table.integer('dsl_version').notNullable().defaultTo(1)
    // ABAC policy rules matching dataset pattern
    table.jsonb('policy_rules').nullable()
    // Multi-tenant isolation
    table.string('tenant_id', 64).notNullable()
    // Optional project association
    table.uuid('project_id').nullable().references('id').inTable('projects').onDelete('SET NULL')
    // Version-as-row: parent_id points to the original agent
    table.uuid('parent_id').nullable().references('id').inTable('agents').onDelete('SET NULL')
    // Monotonically increasing version number (0 = parent)
    table.integer('version_number').notNullable().defaultTo(0)
    // Optional human-readable version label
    table.string('version_label', 128).nullable()
    // Creator tracking
    table.text('created_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Composite index for listing versions of an agent within a tenant
    table.index(['tenant_id', 'parent_id'], 'idx_agents_tenant_parent')
    // Composite index for filtering agents by status within a tenant
    table.index(['tenant_id', 'status'], 'idx_agents_tenant_status')
    // Index for querying agents by creator
    table.index(['created_by'], 'idx_agents_created_by')
    // Index for querying agents by project
    table.index(['project_id'], 'idx_agents_project_id')
  })
}

/**
 * @description Drop the agents table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('agents')
}
