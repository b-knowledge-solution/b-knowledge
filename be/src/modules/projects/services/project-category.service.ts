/**
 * @fileoverview Service for document category and version management within projects.
 * @module services/project-category
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { DocumentCategory, DocumentCategoryVersion, DocumentCategoryVersionFile, UserContext } from '@/shared/models/types.js'

/**
 * @description Service handling document category CRUD, version management,
 *   and version file listing within projects
 */
export class ProjectCategoryService {
  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  /**
   * @description List all document categories for a project
   * @param {string} projectId - UUID of the project
   * @returns {Promise<DocumentCategory[]>} Array of category records
   */
  async listCategories(projectId: string): Promise<DocumentCategory[]> {
    return ModelFactory.documentCategory.findByProjectId(projectId)
  }

  /**
   * @description Retrieve a single document category by its UUID
   * @param {string} categoryId - UUID of the category
   * @returns {Promise<DocumentCategory | undefined>} Category record or undefined if not found
   */
  async getCategoryById(categoryId: string): Promise<DocumentCategory | undefined> {
    return ModelFactory.documentCategory.findById(categoryId)
  }

  /**
   * @description Create a new document category within a project.
   *   For 'standard' and 'code' types, auto-creates a linked dataset.
   *   For 'documents' type, dataset creation is deferred to version creation.
   * @param {string} projectId - UUID of the project
   * @param {any} data - Category creation data including name, description, sort_order, dataset_config, category_type
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategory>} Created category record (with dataset_id if standard/code)
   */
  async createCategory(projectId: string, data: any, user: UserContext): Promise<DocumentCategory> {
    // Default category_type to 'documents' for backward compatibility
    const categoryType = data.category_type || 'documents'

    const category = await ModelFactory.documentCategory.create({
      project_id: projectId,
      name: data.name,
      description: data.description || null,
      // Default sort_order to 0 when not specified
      sort_order: data.sort_order ?? 0,
      category_type: categoryType,
      // Serialize dataset_config as JSON string for storage
      dataset_config: JSON.stringify(data.dataset_config || {}),
      created_by: user.id,
      updated_by: user.id,
    })

    // Auto-create a dataset for standard and code category types
    if (categoryType === 'standard' || categoryType === 'code') {
      try {
        // Look up the project to get default embedding model and parser settings
        const project = await ModelFactory.project.findById(projectId)
        if (!project) throw new Error('Project not found')

        // Code categories force parser_id='code'; standard uses project default or 'naive'
        const parserId = categoryType === 'code' ? 'code' : (project.default_chunk_method || 'naive')

        // Create a dataset named <projectname>_<categoryname>
        const dataset = await ModelFactory.dataset.create({
          name: `${project.name}_${data.name}`,
          description: `Auto-created dataset for project "${project.name}", category "${data.name}"`,
          language: 'English',
          embedding_model: project.default_embedding_model || null,
          parser_id: parserId,
          parser_config: JSON.stringify({}),
          access_control: JSON.stringify({ public: !project.is_private }),
          status: 'active',
          created_by: user.id,
          updated_by: user.id,
        })

        // Link the dataset to the project
        await ModelFactory.projectDataset.create({
          project_id: projectId,
          dataset_id: dataset.id,
          auto_created: true,
        })

        // Store the dataset reference on the category
        await ModelFactory.documentCategory.update(category.id, { dataset_id: dataset.id })

        // Return updated category with dataset_id
        return { ...category, dataset_id: dataset.id }
      } catch (dsError) {
        // Non-blocking: category is still created even if dataset creation fails
        log.warn('Failed to auto-create dataset for category', {
          error: String(dsError), projectId, categoryName: data.name, categoryType,
        })
      }
    }

    return category
  }

  /**
   * @description Update a document category with partial data
   * @param {string} categoryId - UUID of the category
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategory | undefined>} Updated category or undefined if not found
   */
  async updateCategory(categoryId: string, data: any, user: UserContext): Promise<DocumentCategory | undefined> {
    // Build update payload including only provided fields
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.sort_order !== undefined) updateData.sort_order = data.sort_order
    // Serialize dataset_config as JSON string if provided
    if (data.dataset_config !== undefined) updateData.dataset_config = JSON.stringify(data.dataset_config)

    return ModelFactory.documentCategory.update(categoryId, updateData)
  }

  /**
   * @description Delete a document category by ID. For standard/code categories with a linked
   *   dataset, soft-deletes the dataset first. Cascades to versions and files via DB constraints.
   * @param {string} categoryId - UUID of the category
   * @returns {Promise<void>}
   */
  async deleteCategory(categoryId: string): Promise<void> {
    // Look up the category to check for linked dataset before deletion
    const category = await ModelFactory.documentCategory.findById(categoryId)

    // Soft-delete linked dataset if this is a standard/code category with a dataset_id
    if (category?.dataset_id) {
      try {
        await ModelFactory.dataset.update(category.dataset_id, { status: 'inactive' })
      } catch (err) {
        // Non-blocking: proceed with category deletion even if dataset cleanup fails
        log.warn('Failed to soft-delete linked dataset for category', {
          error: String(err), categoryId, datasetId: category.dataset_id,
        })
      }
    }

    await ModelFactory.documentCategory.delete(categoryId)
  }

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  /**
   * @description List all versions for a document category
   * @param {string} categoryId - UUID of the category
   * @returns {Promise<DocumentCategoryVersion[]>} Array of version records
   */
  async listVersions(categoryId: string): Promise<DocumentCategoryVersion[]> {
    return ModelFactory.documentCategoryVersion.findByCategoryId(categoryId)
  }

  /**
   * @description Retrieve a single category version by its UUID
   * @param {string} versionId - UUID of the version
   * @returns {Promise<DocumentCategoryVersion | undefined>} Version record or undefined if not found
   */
  async getVersionById(versionId: string): Promise<DocumentCategoryVersion | undefined> {
    return ModelFactory.documentCategoryVersion.findById(versionId)
  }

  /**
   * @description Create a new version snapshot for a document category.
   *   Auto-creates a dataset named `<projectname>_<version_label>` and links it to the project.
   * @param {string} categoryId - UUID of the category
   * @param {any} data - Version creation data including version_label, optional metadata, optional project_id
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategoryVersion>} Created version record with linked dataset
   * @throws {Error} If the parent category or project is not found
   */
  async createVersion(categoryId: string, data: any, user: UserContext): Promise<DocumentCategoryVersion> {
    // Look up the parent category to resolve the project_id
    const category = await ModelFactory.documentCategory.findById(categoryId)
    if (!category) throw new Error('Category not found')

    // Use provided project_id or resolve from the category
    const projectId = data.project_id || category.project_id

    // Look up the project to build the dataset name
    const project = await ModelFactory.project.findById(projectId)
    if (!project) throw new Error('Project not found')

    // Build dataset name as <projectname>_<version_label>
    const datasetName = `${project.name}_${data.version_label}`

    // Auto-create a dataset for this version
    let datasetId: string | null = null
    try {
      const dataset = await ModelFactory.dataset.create({
        name: datasetName,
        description: `Auto-created dataset for project "${project.name}", version "${data.version_label}"`,
        language: 'English',
        embedding_model: project.default_embedding_model || null,
        parser_id: project.default_chunk_method || 'naive',
        parser_config: JSON.stringify({}),
        access_control: JSON.stringify({ public: !project.is_private }),
        status: 'active',
        created_by: user.id,
        updated_by: user.id,
      })
      datasetId = dataset.id

      // Link the dataset to the project
      await ModelFactory.projectDataset.create({
        project_id: projectId,
        dataset_id: dataset.id,
        auto_created: true,
      })
    } catch (dsError) {
      // Non-blocking: version is still created even if dataset creation fails
      log.warn('Failed to auto-create dataset for version', {
        error: String(dsError), categoryId, versionLabel: data.version_label,
      })
    }

    // Create the version record with the linked dataset ID
    return ModelFactory.documentCategoryVersion.create({
      category_id: categoryId,
      version_label: data.version_label,
      ragflow_dataset_id: datasetId,
      ragflow_dataset_name: datasetId ? datasetName : null,
      status: 'active',
      // Serialize metadata as JSON string for storage
      metadata: JSON.stringify(data.metadata || {}),
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * @description Update a category version with partial data
   * @param {string} versionId - UUID of the version
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<DocumentCategoryVersion | undefined>} Updated version or undefined if not found
   */
  async updateVersion(versionId: string, data: any, user: UserContext): Promise<DocumentCategoryVersion | undefined> {
    // Build update payload including only provided fields
    const updateData: any = { updated_by: user.id }
    if (data.version_label !== undefined) updateData.version_label = data.version_label
    if (data.status !== undefined) updateData.status = data.status
    if (data.ragflow_dataset_id !== undefined) updateData.ragflow_dataset_id = data.ragflow_dataset_id
    if (data.ragflow_dataset_name !== undefined) updateData.ragflow_dataset_name = data.ragflow_dataset_name
    // Serialize metadata as JSON string if provided
    if (data.metadata !== undefined) updateData.metadata = JSON.stringify(data.metadata)

    return ModelFactory.documentCategoryVersion.update(versionId, updateData)
  }

  /**
   * @description Delete a category version by ID, cascading to version files via DB constraints
   * @param {string} versionId - UUID of the version
   * @returns {Promise<void>}
   */
  async deleteVersion(versionId: string): Promise<void> {
    await ModelFactory.documentCategoryVersion.delete(versionId)
  }

  // -------------------------------------------------------------------------
  // Version Files
  // -------------------------------------------------------------------------

  /**
   * @description List all files attached to a specific category version
   * @param {string} versionId - UUID of the version
   * @returns {Promise<DocumentCategoryVersionFile[]>} Array of file records
   */
  async listVersionFiles(versionId: string): Promise<DocumentCategoryVersionFile[]> {
    return ModelFactory.documentCategoryVersionFile.findByVersionId(versionId)
  }
}

/** Singleton instance */
export const projectCategoryService = new ProjectCategoryService()
