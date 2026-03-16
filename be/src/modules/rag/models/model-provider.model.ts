/**
 * @fileoverview ModelProvider model — CRUD for the model_providers table.
 * @module modules/rag/models/model-provider
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ModelProvider } from '@/shared/models/types.js'

/**
 * @description Provides data access for the model_providers table, which stores
 * LLM, embedding, and rerank provider configurations.
 */
export class ModelProviderModel extends BaseModel<ModelProvider> {
  protected tableName = 'model_providers'
  protected knex = db

  /**
   * @description Find all default active model providers across all model types
   * @returns {Promise<ModelProvider[]>} Array of default active ModelProvider records
   */
  async findDefaults(): Promise<ModelProvider[]> {
    return this.knex(this.tableName)
      .where('is_default', true)
      .where('status', 'active')
  }
}
