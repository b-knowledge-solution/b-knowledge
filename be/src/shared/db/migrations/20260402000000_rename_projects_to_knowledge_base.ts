import type { Knex } from 'knex'

/**
 * @description Renames all project-related tables and FK columns to knowledge_base naming convention.
 * All ALTER TABLE RENAME operations are metadata-only in PostgreSQL (instant, no data copy).
 * FK constraints, indexes, and sequences are preserved automatically.
 * Uses knex.raw() exclusively to avoid Knex .renameColumn() bug (#933) that drops DEFAULT constraints.
 */
export async function up(knex: Knex): Promise<void> {
  // Rename core table first (all FKs follow automatically via OID)
  await knex.raw('ALTER TABLE projects RENAME TO knowledge_base')

  // Rename child tables
  await knex.raw('ALTER TABLE project_permissions RENAME TO knowledge_base_permissions')
  await knex.raw('ALTER TABLE project_entity_permissions RENAME TO knowledge_base_entity_permissions')
  await knex.raw('ALTER TABLE project_datasets RENAME TO knowledge_base_datasets')
  await knex.raw('ALTER TABLE project_chats RENAME TO knowledge_base_chats')
  await knex.raw('ALTER TABLE project_searches RENAME TO knowledge_base_searches')
  await knex.raw('ALTER TABLE project_sync_configs RENAME TO knowledge_base_sync_configs')

  // Rename FK columns in renamed tables
  await knex.raw('ALTER TABLE knowledge_base_permissions RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_datasets RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_chats RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_searches RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE knowledge_base_sync_configs RENAME COLUMN project_id TO knowledge_base_id')

  // Rename FK columns in tables that are NOT renamed
  await knex.raw('ALTER TABLE document_categories RENAME COLUMN project_id TO knowledge_base_id')
  await knex.raw('ALTER TABLE agents RENAME COLUMN project_id TO knowledge_base_id')
}

/**
 * @description Reverses all knowledge_base renames back to project naming.
 * Column renames in non-renamed tables first, then column renames in tables about to be renamed,
 * then table renames in reverse order.
 */
export async function down(knex: Knex): Promise<void> {
  // Reverse column renames in non-renamed tables first
  await knex.raw('ALTER TABLE document_categories RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE agents RENAME COLUMN knowledge_base_id TO project_id')

  // Reverse column renames in tables that will be renamed back
  await knex.raw('ALTER TABLE knowledge_base_permissions RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_datasets RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_chats RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_searches RENAME COLUMN knowledge_base_id TO project_id')
  await knex.raw('ALTER TABLE knowledge_base_sync_configs RENAME COLUMN knowledge_base_id TO project_id')

  // Reverse table renames
  await knex.raw('ALTER TABLE knowledge_base_sync_configs RENAME TO project_sync_configs')
  await knex.raw('ALTER TABLE knowledge_base_searches RENAME TO project_searches')
  await knex.raw('ALTER TABLE knowledge_base_chats RENAME TO project_chats')
  await knex.raw('ALTER TABLE knowledge_base_datasets RENAME TO project_datasets')
  await knex.raw('ALTER TABLE knowledge_base_entity_permissions RENAME TO project_entity_permissions')
  await knex.raw('ALTER TABLE knowledge_base_permissions RENAME TO project_permissions')
  await knex.raw('ALTER TABLE knowledge_base RENAME TO projects')
}
