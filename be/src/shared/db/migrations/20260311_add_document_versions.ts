import type { Knex } from 'knex'

/**
 * Migration: Add document versioning and converter job tracking tables.
 * Supports centralized dataset management with document versions and converter integration.
 */
export async function up(knex: Knex): Promise<void> {
  // document_versions: versioned snapshots of a dataset's documents
  await knex.schema.createTable('document_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('dataset_id').notNullable().references('id').inTable('datasets').onDelete('CASCADE')
    table.string('version_label', 128).notNullable()
    table.string('ragflow_dataset_id', 255)
    table.string('ragflow_dataset_name', 255)
    table.string('status', 16).defaultTo('active').notNullable()
    table.timestamp('last_synced_at')
    table.jsonb('metadata').defaultTo('{}')
    table.text('created_by').references('id').inTable('users').onDelete('SET NULL')
    table.timestamps(true, true)

    table.index('dataset_id')
    table.unique(['dataset_id', 'version_label'])
  })

  // document_version_files: individual files within a version
  await knex.schema.createTable('document_version_files', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('version_id').notNullable().references('id').inTable('document_versions').onDelete('CASCADE')
    table.string('file_name', 512).notNullable()
    table.string('ragflow_doc_id', 255)
    table.string('status', 32).defaultTo('pending').notNullable()
    table.text('error')
    table.timestamps(true, true)

    table.unique(['version_id', 'file_name'])
    table.index('version_id')
  })

  // converter_jobs: tracks conversion job state in Postgres
  await knex.schema.createTable('converter_jobs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('dataset_id').notNullable().references('id').inTable('datasets').onDelete('CASCADE')
    table.uuid('version_id').notNullable().references('id').inTable('document_versions').onDelete('CASCADE')
    table.string('status', 32).defaultTo('pending').notNullable()
    table.integer('file_count').defaultTo(0)
    table.integer('finished_count').defaultTo(0)
    table.integer('failed_count').defaultTo(0)
    table.timestamps(true, true)

    table.index('dataset_id')
    table.index('version_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('converter_jobs')
  await knex.schema.dropTableIfExists('document_version_files')
  await knex.schema.dropTableIfExists('document_versions')
}
