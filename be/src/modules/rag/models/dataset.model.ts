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
}
