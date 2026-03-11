/**
 * @fileoverview DocumentVersion model — CRUD for the document_versions table.
 * @module modules/rag/models/document-version
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentVersion } from '@/shared/models/types.js'

/**
 * DocumentVersionModel provides data access for document_versions table.
 * @description Extends BaseModel with dataset-scoped queries.
 */
export class DocumentVersionModel extends BaseModel<DocumentVersion> {
  protected tableName = 'document_versions'
  protected knex = db

  /**
   * Find all versions belonging to a dataset, ordered by creation date descending.
   * @param datasetId - UUID of the parent dataset
   * @returns Array of DocumentVersion records
   */
  async findByDatasetId(datasetId: string): Promise<DocumentVersion[]> {
    return this.knex(this.tableName)
      .where('dataset_id', datasetId)
      .orderBy('created_at', 'desc')
  }

  /**
   * Find a version by dataset ID and version label.
   * @param datasetId - UUID of the parent dataset
   * @param versionLabel - Version label string
   * @returns DocumentVersion or undefined
   */
  async findByLabel(datasetId: string, versionLabel: string): Promise<DocumentVersion | undefined> {
    return this.knex(this.tableName)
      .where({ dataset_id: datasetId, version_label: versionLabel })
      .first()
  }
}
