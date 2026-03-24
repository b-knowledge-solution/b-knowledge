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

  /**
   * @description Find a model provider by its model_name field
   * @param {string} modelName - The model name to search for
   * @returns {Promise<ModelProvider | undefined>} The matching provider or undefined
   */
  async findByModelName(modelName: string): Promise<ModelProvider | undefined> {
    return this.knex(this.tableName)
      .where('model_name', modelName)
      .first()
  }
}
