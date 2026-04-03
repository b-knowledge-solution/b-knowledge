/**
 * @fileoverview Dataset sync service — centralizes the dual-write bridge
 * between the Node.js `datasets` table and the Python `knowledgebase` table.
 *
 * All sync operations are non-blocking (try/catch with warn log) so that
 * failures in the legacy table never block the primary API response.
 *
 * @module modules/rag/services/dataset-sync
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import type { Dataset } from '@/shared/models/types.js'

/**
 * @description Resolve model_providers.id for an embedding model name.
 * @param {string} modelName - The embedding model name
 * @returns {Promise<string | null>} Provider UUID or null
 */
async function resolveEmbeddingProviderId(modelName: string): Promise<string | null> {
  const provider = await ModelFactory.modelProvider.findByModelName(modelName)
  return provider?.id ?? null
}

/**
 * @description Centralizes all datasets → knowledgebase sync operations.
 * The knowledgebase table is the legacy RAGFlow Peewee table used by Python
 * advance-rag workers. This service keeps it in sync with the Node.js datasets table.
 */
class DatasetSyncService {
  /**
   * @description Sync a newly created dataset to the knowledgebase table.
   * Maps Node.js field names to Peewee column conventions (e.g., embedding_model → embd_id).
   * @param {Dataset} dataset - The created dataset record
   * @returns {Promise<void>}
   */
  async syncCreate(dataset: Dataset): Promise<void> {
    try {
      const kbData: Parameters<typeof ModelFactory.knowledgebase.create>[0] = {
        id: dataset.id,
        name: dataset.name,
      }
      if (dataset.description) kbData.description = dataset.description
      if (dataset.language) kbData.language = dataset.language
      if (dataset.embedding_model) {
        kbData.embedding_model = dataset.embedding_model
        // Resolve provider UUID so the Python worker can look up the model config
        const providerId = await resolveEmbeddingProviderId(dataset.embedding_model)
        if (providerId) kbData.tenant_embd_id = providerId
      }
      if (dataset.parser_id) kbData.parser_id = dataset.parser_id
      if (dataset.parser_config) {
        kbData.parser_config = typeof dataset.parser_config === 'string'
          ? JSON.parse(dataset.parser_config) : dataset.parser_config
      }
      if (dataset.pagerank !== undefined) kbData.pagerank = dataset.pagerank
      await ModelFactory.knowledgebase.create(kbData)
    } catch (err) {
      log.warn('DatasetSync: failed to sync create to knowledgebase (non-blocking)', { error: String(err) })
    }
  }

  /**
   * @description Sync dataset field updates to the knowledgebase table.
   * Only syncs fields that were actually changed.
   * @param {string} id - Dataset UUID
   * @param {Record<string, unknown>} changedFields - Fields that were updated
   * @returns {Promise<void>}
   */
  async syncUpdate(id: string, changedFields: Record<string, unknown>): Promise<void> {
    try {
      const kbData: Record<string, unknown> = {}
      if (changedFields.name !== undefined) kbData.name = changedFields.name
      if (changedFields.description !== undefined) kbData.description = changedFields.description
      if (changedFields.language !== undefined) kbData.language = changedFields.language
      if (changedFields.embedding_model !== undefined) {
        kbData.embedding_model = changedFields.embedding_model
        // Resolve provider UUID for Python worker
        const providerId = await resolveEmbeddingProviderId(changedFields.embedding_model as string)
        kbData.tenant_embd_id = providerId
      }
      if (changedFields.parser_id !== undefined) kbData.parser_id = changedFields.parser_id
      if (changedFields.parser_config !== undefined) kbData.parser_config = changedFields.parser_config
      if (changedFields.pagerank !== undefined) kbData.pagerank = changedFields.pagerank

      if (Object.keys(kbData).length > 0) {
        await ModelFactory.knowledgebase.update(id, kbData)
      }
    } catch (err) {
      log.warn('DatasetSync: failed to sync update to knowledgebase (non-blocking)', { error: String(err) })
    }
  }

  /**
   * @description Sync dataset soft-delete to the knowledgebase table.
   * @param {string} id - Dataset UUID
   * @returns {Promise<void>}
   */
  async syncDelete(id: string): Promise<void> {
    try {
      await ModelFactory.knowledgebase.softDelete(id)
    } catch (err) {
      log.warn('DatasetSync: failed to sync delete to knowledgebase (non-blocking)', { error: String(err) })
    }
  }
}

/** @description Singleton instance of DatasetSyncService */
export const datasetSyncService = new DatasetSyncService()
