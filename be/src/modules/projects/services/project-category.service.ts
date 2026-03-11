/**
 * @fileoverview Service for document category and version management within projects.
 * @module services/project-category
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { DocumentCategory, DocumentCategoryVersion, DocumentCategoryVersionFile, UserContext } from '@/shared/models/types.js'

/**
 * ProjectCategoryService handles category CRUD and version management.
 */
export class ProjectCategoryService {
  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /**
   * List all categories for a project.
   * @param projectId - UUID of the project
   * @returns Array of category records
   */
  async listCategories(projectId: string): Promise<DocumentCategory[]> {
    return ModelFactory.documentCategory.findByProjectId(projectId)
  }

  /**
   * Get a single category by ID.
   * @param categoryId - UUID of the category
   * @returns Category record or undefined
   */
  async getCategoryById(categoryId: string): Promise<DocumentCategory | undefined> {
    return ModelFactory.documentCategory.findById(categoryId)
  }

  /**
   * Create a new document category.
   * @param projectId - UUID of the project
   * @param data - Category creation data
   * @param user - Authenticated user context
   * @returns Created category
   */
  async createCategory(projectId: string, data: any, user: UserContext): Promise<DocumentCategory> {
    return ModelFactory.documentCategory.create({
      project_id: projectId,
      name: data.name,
      description: data.description || null,
      sort_order: data.sort_order ?? 0,
      dataset_config: JSON.stringify(data.dataset_config || {}),
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * Update a document category.
   * @param categoryId - UUID of the category
   * @param data - Partial update data
   * @param user - Authenticated user context
   * @returns Updated category or undefined
   */
  async updateCategory(categoryId: string, data: any, user: UserContext): Promise<DocumentCategory | undefined> {
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order
    if (data.dataset_config !== undefined) updateData.dataset_config = JSON.stringify(data.dataset_config)

    return ModelFactory.documentCategory.update(categoryId, updateData)
  }

  /**
   * Delete a document category by ID (cascades to versions and files).
   * @param categoryId - UUID of the category
   */
  async deleteCategory(categoryId: string): Promise<void> {
    await ModelFactory.documentCategory.delete(categoryId)
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  /**
   * List all versions for a category.
   * @param categoryId - UUID of the category
   * @returns Array of version records
   */
  async listVersions(categoryId: string): Promise<DocumentCategoryVersion[]> {
    return ModelFactory.documentCategoryVersion.findByCategoryId(categoryId)
  }

  /**
   * Get a single version by ID.
   * @param versionId - UUID of the version
   * @returns Version record or undefined
   */
  async getVersionById(versionId: string): Promise<DocumentCategoryVersion | undefined> {
    return ModelFactory.documentCategoryVersion.findById(versionId)
  }

  /**
   * Create a new category version.
   * @param categoryId - UUID of the category
   * @param data - Version creation data
   * @param user - Authenticated user context
   * @returns Created version
   */
  async createVersion(categoryId: string, data: any, user: UserContext): Promise<DocumentCategoryVersion> {
    return ModelFactory.documentCategoryVersion.create({
      category_id: categoryId,
      version_label: data.version_label,
      status: 'active',
      metadata: JSON.stringify(data.metadata || {}),
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * Update a category version.
   * @param versionId - UUID of the version
   * @param data - Partial update data
   * @param user - Authenticated user context
   * @returns Updated version or undefined
   */
  async updateVersion(versionId: string, data: any, user: UserContext): Promise<DocumentCategoryVersion | undefined> {
    const updateData: any = { updated_by: user.id }
    if (data.version_label !== undefined) updateData.version_label = data.version_label
    if (data.status !== undefined) updateData.status = data.status
    if (data.ragflow_dataset_id !== undefined) updateData.ragflow_dataset_id = data.ragflow_dataset_id
    if (data.ragflow_dataset_name !== undefined) updateData.ragflow_dataset_name = data.ragflow_dataset_name
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata)

    return ModelFactory.documentCategoryVersion.update(versionId, updateData)
  }

  /**
   * Delete a category version by ID (cascades to files).
   * @param versionId - UUID of the version
   */
  async deleteVersion(versionId: string): Promise<void> {
    await ModelFactory.documentCategoryVersion.delete(versionId)
  }

  // -------------------------------------------------------------------------
  // Version Files
  // -------------------------------------------------------------------------

  /**
   * List all files for a version.
   * @param versionId - UUID of the version
   * @returns Array of file records
   */
  async listVersionFiles(versionId: string): Promise<DocumentCategoryVersionFile[]> {
    return ModelFactory.documentCategoryVersionFile.findByVersionId(versionId)
  }
}

/** Singleton instance */
export const projectCategoryService = new ProjectCategoryService()
