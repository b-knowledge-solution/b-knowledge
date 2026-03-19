/**
 * @fileoverview Migration to add tenant_id column to the projects table.
 * @description Enables multi-tenant isolation for projects by linking each project
 *   to an organization (tenant). Backfills from the creator's user_tenant mapping.
 */
import type { Knex } from 'knex'

/**
 * @description Add tenant_id to projects table, backfill from creator's org, then enforce NOT NULL.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // Step 1: Add tenant_id as nullable TEXT column first
  await knex.schema.alterTable('projects', (table) => {
    table.text('tenant_id').nullable()
  })

  // Step 2: Backfill tenant_id from creator's org via user_tenant junction
  await knex.raw(`
    UPDATE projects p
    SET tenant_id = COALESCE(
      (SELECT ut.tenant_id FROM user_tenant ut WHERE ut.user_id = p.created_by LIMIT 1),
      'default'
    )
    WHERE p.tenant_id IS NULL
  `)

  // Step 3: Alter to NOT NULL after backfill is complete
  await knex.schema.alterTable('projects', (table) => {
    table.text('tenant_id').notNullable().alter()
    // Index for tenant-scoped queries (project listing, filtering)
    table.index(['tenant_id'])
  })
}

/**
 * @description Remove tenant_id column from projects table.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('projects', (table) => {
    table.dropIndex(['tenant_id'])
    table.dropColumn('tenant_id')
  })
}
