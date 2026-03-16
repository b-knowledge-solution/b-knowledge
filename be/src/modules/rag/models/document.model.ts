/**
 * @fileoverview Document model — CRUD for the documents table.
 * @module modules/rag/models/document
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Document } from '@/shared/models/types.js'

/**
 * @description Provides data access for the documents table with dataset-scoped queries.
 */
export class DocumentModel extends BaseModel<Document> {
  protected tableName = 'documents'
  protected knex = db

  /**
   * @description Find all documents belonging to a dataset, ordered by creation date descending
   * @param {string} datasetId - UUID of the parent dataset
   * @returns {Promise<Document[]>} Array of Document records
   */
  async findByDatasetId(datasetId: string): Promise<Document[]> {
    return this.knex(this.tableName)
      .where('dataset_id', datasetId)
      .orderBy('created_at', 'desc')
  }
}
