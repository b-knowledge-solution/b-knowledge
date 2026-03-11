/**
 * @fileoverview Migration to add project_datasets and project_sync_configs tables.
 * @description Creates junction table linking projects to datasets and
 *   configuration table for external data source sync.
 */
import type { Knex } from 'knex'

/**
 * Create project_datasets and project_sync_configs tables.
 * @param knex - Knex instance
 * @returns Promise<void>
 */
export async function up(knex: Knex): Promise<void> {
  // project_datasets: junction linking projects to datasets
  await knex.schema.createTable('project_datasets', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent project
    table.text('project_id').notNullable()
    // Reference to the linked dataset (UUID type)
    table.uuid('dataset_id').notNullable()
    // Whether the dataset was auto-created with the project
    table.boolean('auto_created').defaultTo(false)
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    table.foreign('dataset_id').references('datasets.id').onDelete('CASCADE')
    // Prevent duplicate project-dataset links
    table.unique(['project_id', 'dataset_id'])
    table.index('project_id')
    table.index('dataset_id')
  })

  // project_sync_configs: external data source sync configuration
  await knex.schema.createTable('project_sync_configs', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
    // Reference to the parent project
    table.text('project_id').notNullable()
    // Type of external source
    table.text('source_type').notNullable()
    // Encrypted connection configuration (credentials, URLs, etc.)
    table.text('connection_config')
    // Cron expression or preset schedule
    table.text('sync_schedule')
    // Filter rules for sync (file types, date range, labels)
    table.jsonb('filter_rules').defaultTo('{}')
    // Last successful sync timestamp
    table.timestamp('last_synced_at', { useTz: true })
    // Sync config status: active, paused, error
    table.text('status').notNullable().defaultTo('active')
    table.text('created_by')
    table.text('updated_by')
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.foreign('project_id').references('projects.id').onDelete('CASCADE')
    // Enforce valid source types
    table.check(
      "?? IN ('sharepoint', 'jira', 'confluence', 'gitlab', 'github')",
      ['source_type']
    )
    table.index('project_id')
    table.index('source_type')
    table.index('status')
  })
}

/**
 * Drop project_sync_configs and project_datasets tables.
 * @param knex - Knex instance
 * @returns Promise<void>
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('project_sync_configs')
  await knex.schema.dropTableIfExists('project_datasets')
}
