/**
 * @fileoverview DocumentCategory model for CRUD on document_categories table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { DocumentCategory } from '@/shared/models/types.js'
import { SEARCHABLE_VERSION_STATUSES } from '@/shared/constants/statuses.js'

/**
 * @description Provides CRUD operations for the document_categories table,
 *   which organizes knowledge base documents into named groups with ordering
 * @extends BaseModel<DocumentCategory>
 */
export class DocumentCategoryModel extends BaseModel<DocumentCategory> {
  protected tableName = 'document_categories'
  protected knex = db

  /**
   * @description Find all categories for a given knowledge base, ordered by sort_order ascending
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<DocumentCategory[]>} Array of category records
   */
  async findByKnowledgeBaseId(knowledgeBaseId: string): Promise<DocumentCategory[]> {
    return this.knex(this.tableName)
      .where('knowledge_base_id', knowledgeBaseId)
      .orderBy('sort_order', 'asc')
  }

  /**
   * @description Resolve a set of document category IDs to the flat, deduped
   * list of underlying dataset IDs. Used by Phase 6 grant enforcement to
   * translate DocumentCategory grants into RAG-search dataset IDs.
   * @param {readonly string[]} categoryIds - Category IDs to resolve.
   * @returns {Promise<string[]>} Flat deduped dataset ID list.
   */
  async findDatasetIdsByCategoryIds(categoryIds: readonly string[]): Promise<string[]> {
    // Short-circuit empty input so callers avoid a dead SQL round-trip.
    if (categoryIds.length === 0) return []

    // Source 1: direct dataset IDs stored on standard/code categories.
    const directRows = await this.knex(this.tableName)
      .whereIn('id', categoryIds as string[])
      .whereNotNull('dataset_id')
      .select<{ dataset_id: string | null }[]>('dataset_id')

    // Source 2: version-backed dataset IDs for document categories. Only
    // ACTIVE or SYNCING versions are exposed to grant-based search.
    const versionRows = await this.knex('document_category_versions')
      .whereIn('category_id', categoryIds as string[])
      .whereNotNull('ragflow_dataset_id')
      .whereIn('status', SEARCHABLE_VERSION_STATUSES as unknown as string[])
      .select<{ dataset_id: string | null }[]>({ dataset_id: 'ragflow_dataset_id' })

    const datasetIds = new Set<string>()
    for (const row of directRows) {
      if (row.dataset_id) datasetIds.add(row.dataset_id)
    }
    for (const row of versionRows) {
      if (row.dataset_id) datasetIds.add(row.dataset_id)
    }

    return Array.from(datasetIds)
  }

  /**
   * @description Resolve a set of knowledge base IDs to the flat, deduped
   * dataset IDs attached to their categories.
   * @param {readonly string[]} kbIds - Knowledge base IDs to resolve.
   * @returns {Promise<string[]>} Flat deduped dataset ID list.
   */
  async findDatasetIdsByKnowledgeBaseIds(kbIds: readonly string[]): Promise<string[]> {
    // Short-circuit empty input so the query plan stays simple.
    if (kbIds.length === 0) return []

    // Source 1: direct dataset IDs on categories under the target KBs.
    const directRows = await this.knex(this.tableName)
      .whereIn('knowledge_base_id', kbIds as string[])
      .whereNotNull('dataset_id')
      .select<{ dataset_id: string | null }[]>('dataset_id')

    // Source 2: version-backed dataset IDs joined through the categories table.
    const versionRows = await this.knex('document_category_versions as dcv')
      .join(`${this.tableName} as dc`, 'dcv.category_id', 'dc.id')
      .whereIn('dc.knowledge_base_id', kbIds as string[])
      .whereNotNull('dcv.ragflow_dataset_id')
      .whereIn('dcv.status', SEARCHABLE_VERSION_STATUSES as unknown as string[])
      .select<{ dataset_id: string | null }[]>({ dataset_id: 'dcv.ragflow_dataset_id' })

    const datasetIds = new Set<string>()
    for (const row of directRows) {
      if (row.dataset_id) datasetIds.add(row.dataset_id)
    }
    for (const row of versionRows) {
      if (row.dataset_id) datasetIds.add(row.dataset_id)
    }

    return Array.from(datasetIds)
  }
}
