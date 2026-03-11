/**
 * @fileoverview ConverterJob model — CRUD for the converter_jobs table.
 * @module modules/rag/models/converter-job
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ConverterJob } from '@/shared/models/types.js'

/**
 * ConverterJobModel provides data access for converter_jobs table.
 * @description Extends BaseModel with version-scoped queries.
 */
export class ConverterJobModel extends BaseModel<ConverterJob> {
  protected tableName = 'converter_jobs'
  protected knex = db

  /**
   * Find the latest converter job for a version.
   * @param versionId - UUID of the version
   * @returns ConverterJob or undefined
   */
  async findLatestByVersionId(versionId: string): Promise<ConverterJob | undefined> {
    return this.knex(this.tableName)
      .where('version_id', versionId)
      .orderBy('created_at', 'desc')
      .first()
  }

  /**
   * Find all jobs for a dataset, ordered by creation date descending.
   * @param datasetId - UUID of the dataset
   * @returns Array of ConverterJob records
   */
  async findByDatasetId(datasetId: string): Promise<ConverterJob[]> {
    return this.knex(this.tableName)
      .where('dataset_id', datasetId)
      .orderBy('created_at', 'desc')
  }
}
