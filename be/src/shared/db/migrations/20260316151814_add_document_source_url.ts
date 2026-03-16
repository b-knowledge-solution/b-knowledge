import type { Knex } from 'knex'

/**
 * @description Add source_url column to the document table for web-crawled document tracking.
 * The source_type column already exists with default 'local'. This adds source_url
 * to store the original URL when documents are created via web crawl.
 */
export async function up(knex: Knex): Promise<void> {
  // Add source_url to track original URL for web-crawled documents
  await knex.schema.alterTable('document', (table) => {
    table.string('source_url', 2048).nullable()
  })
}

/**
 * @description Remove the source_url column from the document table
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('document', (table) => {
    table.dropColumn('source_url')
  })
}
