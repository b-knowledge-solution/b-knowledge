/**
 * @fileoverview Dataset model — CRUD for the datasets table.
 * @module modules/rag/models/dataset
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Dataset } from '@/shared/models/types.js'

/**
 * @description Provides data access for the datasets table via BaseModel CRUD.
 */
export class DatasetModel extends BaseModel<Dataset> {
  protected tableName = 'datasets'
  protected knex = db

  /**
   * @description Case-insensitive name lookup excluding soft-deleted datasets
   * @param {string} name - Dataset name to search for
   * @returns {Promise<Dataset | undefined>} Matching dataset or undefined
   */
  async findByNameCaseInsensitive(name: string): Promise<Dataset | undefined> {
    return this.knex(this.tableName)
      .whereRaw('LOWER(name) = LOWER(?)', [name])
      .where('status', '!=', 'deleted')
      .first()
  }

  /**
   * @description Find the maximum version_number for a given parent dataset
   * @param {string} parentDatasetId - Parent dataset UUID
   * @returns {Promise<number>} The max version number, or 0 if none exist
   */
  async findMaxVersionNumber(parentDatasetId: string): Promise<number> {
    const result = await this.knex(this.tableName)
      .where('parent_dataset_id', parentDatasetId)
      .max('version_number as max')
      .first()
    return (result?.max as number) ?? 0
  }

  /**
   * @description Get all active version datasets for a parent, ordered by version_number ascending
   * @param {string} parentDatasetId - Parent dataset UUID
   * @returns {Promise<Dataset[]>} Array of version datasets
   */
  async findVersionsByParent(parentDatasetId: string): Promise<Dataset[]> {
    return this.knex(this.tableName)
      .where('parent_dataset_id', parentDatasetId)
      .where('status', '!=', 'deleted')
      .orderBy('version_number', 'asc')
  }

  /**
   * @description Bulk update metadata_tags in parser_config JSONB for multiple datasets.
   * Supports merge (add to existing) and overwrite (replace entirely) modes.
   * @param {string[]} datasetIds - Array of dataset UUIDs to update
   * @param {Record<string, string>} metadataTags - Key-value pairs to set
   * @param {'merge' | 'overwrite'} mode - Merge or overwrite strategy
   * @param {string} tenantId - Tenant ID for access control scoping
   * @returns {Promise<void>}
   */
  async bulkUpdateMetadataTags(
    datasetIds: string[],
    metadataTags: Record<string, string>,
    mode: 'merge' | 'overwrite',
    tenantId: string,
  ): Promise<void> {
    const tagsJson = JSON.stringify(metadataTags)

    if (mode === 'merge') {
      // Merge new tags into existing metadata_tags, preserving other parser_config keys
      await this.knex(this.tableName)
        .whereIn('id', datasetIds)
        .andWhere('tenant_id', tenantId)
        .update({
          parser_config: this.knex.raw(
            `jsonb_set(COALESCE(parser_config, '{}'), '{metadata_tags}', COALESCE(parser_config->'metadata_tags', '{}') || ?::jsonb)`,
            [tagsJson],
          ),
        })
    } else {
      // Overwrite mode: replace metadata_tags entirely
      await this.knex(this.tableName)
        .whereIn('id', datasetIds)
        .andWhere('tenant_id', tenantId)
        .update({
          parser_config: this.knex.raw(
            `jsonb_set(COALESCE(parser_config, '{}'), '{metadata_tags}', ?::jsonb)`,
            [tagsJson],
          ),
        })
    }
  }
}
