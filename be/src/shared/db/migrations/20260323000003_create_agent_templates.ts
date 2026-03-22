/**
 * @fileoverview Migration to create the agent_templates table.
 * @description Stores pre-built agent workflow templates. System templates
 *   (is_system=true) are global and cannot be deleted. Tenant templates
 *   (tenant_id != NULL) are org-specific custom templates.
 */
import type { Knex } from 'knex'

/**
 * @description Create the agent_templates table with indexes for tenant and category lookups.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('agent_templates', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    // Template display name
    table.string('name', 255).notNullable()
    // Optional description of what the template does
    table.text('description').nullable()
    // Template avatar/icon URL
    table.string('avatar', 512).nullable()
    // Category for gallery filtering (e.g., 'customer-support', 'data-processing')
    table.string('category', 100).nullable()
    // Execution mode: 'agent' or 'pipeline'
    table.string('mode', 20).notNullable().defaultTo('agent')
    // JSONB workflow graph template
    table.jsonb('dsl').notNullable().defaultTo('{}')
    // DSL schema version
    table.integer('dsl_version').notNullable().defaultTo(1)
    // System templates cannot be deleted by users
    table.boolean('is_system').notNullable().defaultTo(false)
    // NULL = global system template; non-null = tenant-specific custom template
    table.string('tenant_id', 64).nullable()
    // Creator tracking
    table.text('created_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

    // Index for tenant-scoped template listing
    table.index(['tenant_id'], 'idx_agent_templates_tenant')
    // Index for category-based gallery filtering
    table.index(['category'], 'idx_agent_templates_category')
  })
}

/**
 * @description Drop the agent_templates table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('agent_templates')
}
