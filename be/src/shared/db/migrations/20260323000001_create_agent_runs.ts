/**
 * @fileoverview Migration to create agent_runs and agent_run_steps tables.
 * @description Tracks agent execution history with per-node step logging
 *   for debugging, observability, and audit trail purposes.
 */
import type { Knex } from 'knex'

/**
 * @description Create agent_runs and agent_run_steps tables with performance indexes.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // Create the parent runs table first (steps reference it)
  await knex.schema.createTable('agent_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Which agent was executed
    table.uuid('agent_id').notNullable().references('id').inTable('agents').onDelete('CASCADE')
    // Multi-tenant isolation
    table.string('tenant_id', 64).notNullable()
    // Execution lifecycle status
    table.string('status', 20).notNullable().defaultTo('pending')
    // Execution mode copied from agent at run start
    table.string('mode', 20).notNullable()
    // User-provided input text/query
    table.text('input').nullable()
    // Final output from the agent execution
    table.text('output').nullable()
    // Error message if execution failed
    table.text('error').nullable()
    // Timing fields for duration tracking
    table.timestamp('started_at', { useTz: true }).nullable()
    table.timestamp('completed_at', { useTz: true }).nullable()
    // Pre-computed duration in milliseconds for analytics
    table.integer('duration_ms').nullable()
    // Progress tracking: total vs completed node count
    table.integer('total_nodes').defaultTo(0)
    table.integer('completed_nodes').defaultTo(0)
    // Who triggered the run
    table.text('triggered_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    // How the run was triggered
    table.string('trigger_type', 20).notNullable().defaultTo('manual')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Index for listing runs of a specific agent
    table.index(['agent_id'], 'idx_agent_runs_agent_id')
    // Composite index for tenant-scoped status filtering
    table.index(['tenant_id', 'status'], 'idx_agent_runs_tenant_status')
  })

  // Create the child steps table
  await knex.schema.createTable('agent_run_steps', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Parent run this step belongs to
    table.uuid('run_id').notNullable().references('id').inTable('agent_runs').onDelete('CASCADE')
    // Node identifier from the DSL graph
    table.string('node_id', 255).notNullable()
    // Node type for dispatch (e.g., 'llm', 'retrieval', 'code')
    table.string('node_type', 100).notNullable()
    // Human-readable node label from canvas
    table.string('node_label', 255).nullable()
    // Step execution status
    table.string('status', 20).notNullable().defaultTo('pending')
    // Input/output data for debugging
    table.jsonb('input_data').nullable()
    table.jsonb('output_data').nullable()
    // Error message if step failed
    table.text('error').nullable()
    // Timing fields
    table.timestamp('started_at', { useTz: true }).nullable()
    table.timestamp('completed_at', { useTz: true }).nullable()
    table.integer('duration_ms').nullable()
    // Execution order for sequential replay
    table.integer('execution_order').notNullable().defaultTo(0)
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Index for listing steps of a run
    table.index(['run_id'], 'idx_agent_run_steps_run_id')
    // Composite index for looking up a specific node within a run
    table.index(['run_id', 'node_id'], 'idx_agent_run_steps_run_node')
  })
}

/**
 * @description Drop agent_run_steps and agent_runs tables in reverse order.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  // Drop child table first to avoid FK constraint violations
  await knex.schema.dropTableIfExists('agent_run_steps')
  await knex.schema.dropTableIfExists('agent_runs')
}
