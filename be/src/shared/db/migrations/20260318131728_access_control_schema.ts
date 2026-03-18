/**
 * @fileoverview Access control schema migration for multi-org ABAC support.
 * @description Evolves the database schema to support multi-org tenancy, ABAC
 * policy storage on knowledgebases and documents, a platform-level policies
 * table, and tenant-scoped audit logs. Also backfills existing data to the
 * system tenant.
 */
import type { Knex } from 'knex'

/** System tenant ID used for backfilling existing rows */
const SYSTEM_TENANT_ID = (
  process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
).replace(/-/g, '')

/**
 * @description Add multi-org columns, ABAC policy storage, platform_policies table,
 * and tenant-scoped audit logs. Backfill existing data to system tenant.
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Evolve tenant table for multi-org support
  await knex.schema.alterTable('tenant', (table) => {
    // Display name for org-facing UIs (distinct from internal 'name')
    table.text('display_name').nullable()
    // Human-readable description of the organization
    table.text('description').nullable()
    // Extensible JSON settings for org-level configuration
    table.jsonb('settings').defaultTo('{}')
    // Track who created and last modified the org
    table.text('created_by').nullable()
    table.text('updated_by').nullable()
  })

  // 2. Add unique constraint on user_tenant to prevent duplicate memberships
  // The table already has user_id and tenant_id columns from the initial schema
  await knex.raw(
    `ALTER TABLE user_tenant ADD CONSTRAINT uq_user_tenant UNIQUE (user_id, tenant_id)`
  )

  // 3. Add ABAC policy rules column to knowledgebase
  await knex.schema.alterTable('knowledgebase', (table) => {
    // JSONB array of CASL-style ABAC rules attached to this dataset
    table.jsonb('policy_rules').defaultTo('[]')
  })

  // 4. Add document-level permission overrides
  await knex.schema.alterTable('document', (table) => {
    // JSONB array of permission overrides that can only restrict (not expand) access
    table.jsonb('policy_overrides').defaultTo('[]')
  })

  // 5. Create platform_policies table for super-admin managed policies
  await knex.schema.createTable('platform_policies', (table) => {
    table.text('id').primary().defaultTo(knex.raw("gen_random_uuid()::TEXT"))
    table.text('name').notNullable()
    table.text('description').nullable()
    // JSONB array of CASL-style rules that apply platform-wide
    table.jsonb('rules').notNullable().defaultTo('[]')
    // Whether this policy is currently enforced
    table.boolean('is_active').defaultTo(true)
    table.text('created_by').nullable()
    table.text('updated_by').nullable()
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })

  // 6. Add tenant_id to audit_logs for org-scoped audit queries
  await knex.schema.alterTable('audit_logs', (table) => {
    table.text('tenant_id').nullable()
  })
  // Index for filtering audit logs by tenant
  await knex.raw(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id)`
  )

  // 7. Backfill existing data to system tenant
  // Set tenant_id on all existing audit_logs rows
  await knex('audit_logs')
    .whereNull('tenant_id')
    .update({ tenant_id: SYSTEM_TENANT_ID })

  // Ensure all existing users have a user_tenant row for the system tenant.
  // Only insert rows for users that do not already have a mapping.
  const usersWithoutTenant = await knex('users')
    .leftJoin('user_tenant', function () {
      this.on('users.id', '=', 'user_tenant.user_id')
        .andOn('user_tenant.tenant_id', '=', knex.raw('?', [SYSTEM_TENANT_ID]))
    })
    .whereNull('user_tenant.id')
    .select('users.id as user_id', 'users.role as role')

  if (usersWithoutTenant.length > 0) {
    const now = Date.now()
    const nowDate = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const rows = usersWithoutTenant.map((u) => ({
      id: knex.raw("gen_random_uuid()::TEXT"),
      user_id: u.user_id,
      tenant_id: SYSTEM_TENANT_ID,
      role: u.role || 'user',
      invited_by: SYSTEM_TENANT_ID,
      status: '1',
      create_time: now,
      create_date: nowDate,
      update_time: now,
      update_date: nowDate,
    }))
    await knex('user_tenant').insert(rows)
  }
}

/**
 * @description Reverse all access control schema changes.
 * Drops new columns, table, and constraint added in up().
 * @param {Knex} knex - Knex instance for schema operations
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  // Remove tenant_id index and column from audit_logs
  await knex.raw('DROP INDEX IF EXISTS idx_audit_logs_tenant_id')
  await knex.schema.alterTable('audit_logs', (table) => {
    table.dropColumn('tenant_id')
  })

  // Drop platform_policies table
  await knex.schema.dropTableIfExists('platform_policies')

  // Remove policy_overrides from document
  await knex.schema.alterTable('document', (table) => {
    table.dropColumn('policy_overrides')
  })

  // Remove policy_rules from knowledgebase
  await knex.schema.alterTable('knowledgebase', (table) => {
    table.dropColumn('policy_rules')
  })

  // Remove unique constraint from user_tenant
  await knex.raw('ALTER TABLE user_tenant DROP CONSTRAINT IF EXISTS uq_user_tenant')

  // Remove multi-org columns from tenant
  await knex.schema.alterTable('tenant', (table) => {
    table.dropColumn('display_name')
    table.dropColumn('description')
    table.dropColumn('settings')
    table.dropColumn('created_by')
    table.dropColumn('updated_by')
  })
}
