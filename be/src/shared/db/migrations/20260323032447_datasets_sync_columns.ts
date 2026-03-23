/**
 * @fileoverview Add sync columns to datasets table.
 * @description Adds columns to the datasets table that exist in the knowledgebase
 * table, enabling the backend to read all dataset metadata from a single table.
 * Backfills tenant_id from knowledgebase where possible.
 */
import type { Knex } from 'knex'

/** System tenant ID used for backfilling */
const SYSTEM_TENANT_ID = (
  process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
).replace(/-/g, '')

/**
 * @description Add sync columns to datasets table for dual-write bridge.
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('datasets', (table) => {
    // Tenant scoping — matches knowledgebase.tenant_id
    table.text('tenant_id').nullable().index()
    // Search tuning — matches knowledgebase columns
    table.float('similarity_threshold').defaultTo(0.2)
    table.float('vector_similarity_weight').defaultTo(0.3)
    // Task tracking — matches knowledgebase columns
    table.text('graphrag_task_id').nullable()
    table.text('raptor_task_id').nullable()
    table.text('mindmap_task_id').nullable()
    // Pipeline assignment — matches knowledgebase.pipeline_id
    table.text('pipeline_id').nullable()
    // Embedding provider reference — matches knowledgebase.tenant_embd_id
    table.text('tenant_embd_id').nullable()
  })

  // Backfill tenant_id on existing datasets from the system tenant
  await knex('datasets')
    .whereNull('tenant_id')
    .update({ tenant_id: SYSTEM_TENANT_ID })
}

/**
 * @description Remove sync columns from datasets table.
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('datasets', (table) => {
    table.dropColumn('tenant_id')
    table.dropColumn('similarity_threshold')
    table.dropColumn('vector_similarity_weight')
    table.dropColumn('graphrag_task_id')
    table.dropColumn('raptor_task_id')
    table.dropColumn('mindmap_task_id')
    table.dropColumn('pipeline_id')
    table.dropColumn('tenant_embd_id')
  })
}
