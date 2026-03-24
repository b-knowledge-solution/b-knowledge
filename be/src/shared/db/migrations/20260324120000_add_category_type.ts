import { Knex } from 'knex'

/**
 * @description Add category_type discriminator and dataset_id FK to document_categories.
 * Per D-01: three fixed types (documents, standard, code).
 * Per D-02: standard/code categories own a single dataset via dataset_id.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('document_categories', (table) => {
    // Type discriminator: documents (versioned), standard (single dataset), code (code parser)
    // Default 'documents' ensures existing rows are backward-compatible
    table.text('category_type').notNullable().defaultTo('documents')
    // Direct dataset reference for standard/code categories (not versioned)
    table.text('dataset_id').nullable()
    table.index('category_type')
  })

  // Add foreign key for dataset_id in a separate ALTER for clarity
  await knex.schema.alterTable('document_categories', (table) => {
    table.foreign('dataset_id').references('datasets.id').onDelete('SET NULL')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('document_categories', (table) => {
    table.dropForeign(['dataset_id'])
    table.dropColumn('dataset_id')
    table.dropIndex('category_type')
    table.dropColumn('category_type')
  })
}
