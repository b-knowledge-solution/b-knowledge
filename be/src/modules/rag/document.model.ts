import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Document } from '@/shared/models/types.js'

export class DocumentModel extends BaseModel<Document> {
  protected tableName = 'documents'
  protected knex = db

  async findByDatasetId(datasetId: string): Promise<Document[]> {
    return this.knex(this.tableName)
      .where('dataset_id', datasetId)
      .orderBy('created_at', 'desc')
  }
}
