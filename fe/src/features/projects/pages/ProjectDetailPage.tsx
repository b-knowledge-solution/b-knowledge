/**
 * @fileoverview Project detail page with 3 category tabs and settings sheet.
 *
 * Features:
 * - Header with back button, project name (display size), status badge, gear icon for settings
 * - Three fixed tabs: Documents, Standard, Code — each with CategorySidebar + content area
 * - URL state for active tab (?tab=) and active category (?category=)
 * - Settings accessible via ProjectSettingsSheet (gear icon)
 * - Dark/light theme support, full i18n
 *
 * @module features/projects/pages/ProjectDetailPage
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  FolderOpen,
  FileText,
  Code2,
  Settings,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { globalMessage } from '@/app/App'

import {
  getProjectById,
  getDocumentCategories,
  type Project,
  type DocumentCategory,
  type DocumentCategoryType,
} from '../api/projectApi'
import DocumentsTab from '../components/DocumentsTab'
import CategorySidebar from '../components/CategorySidebar'
import ProjectSettingsSheet from '../components/ProjectSettingsSheet'
import CategoryModal from '../components/CategoryModal'
import {
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
} from '../api/projectApi'
import { useConfirm } from '@/components/ConfirmDialog'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Project detail page with 3 category tabs (Documents, Standard, Code) and a settings sheet.
 * Categories are fetched once and filtered client-side per tab. Tab and category selection are URL-persisted.
 * @returns {JSX.Element} Rendered project detail page
 */
const ProjectDetailPage = () => {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const confirm = useConfirm()

  // URL state for tab and category selection
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') || 'documents') as DocumentCategoryType
  const activeCategoryId = searchParams.get('category') || null

  // Project data
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  // All categories fetched once, filtered client-side per tab
  const [allCategories, setAllCategories] = useState<DocumentCategory[]>([])

  // Settings sheet state
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Category modal state (shared across all tabs)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<DocumentCategory | null>(null)
  const [categorySaving, setCategorySaving] = useState(false)

  // Derive filtered categories per tab type
  const documentCategories = allCategories.filter(c => c.category_type === 'documents')
  const standardCategories = allCategories.filter(c => c.category_type === 'standard')
  const codeCategories = allCategories.filter(c => c.category_type === 'code')

  /**
   * @description Fetch project and all categories
   */
  const fetchProject = async () => {
    if (!projectId) return
    try {
      setLoading(true)
      const [projectData, categoryData] = await Promise.all([
        getProjectById(projectId),
        getDocumentCategories(projectId),
      ])
      setProject(projectData)
      setAllCategories(categoryData)
    } catch (err) {
      console.error('Failed to load project:', err)
      globalMessage.error(String(err))
    } finally {
      setLoading(false)
    }
  }

  // Load project on mount
  useEffect(() => {
    fetchProject()
  }, [projectId])

  /**
   * @description Handle tab change — update URL and clear category selection
   * @param {string} tab - New tab value
   */
  const handleTabChange = (tab: string) => {
    // Clear category when switching tabs to avoid stale selection
    setSearchParams({ tab })
  }

  /**
   * @description Handle category selection — update URL with both tab and category
   * @param {string} categoryId - Selected category ID
   */
  const handleSelectCategory = (categoryId: string) => {
    setSearchParams({ tab: activeTab, category: categoryId })
  }

  /**
   * @description Open the create category modal for the current tab type
   */
  const handleCreateCategoryClick = () => {
    setEditingCategory(null)
    setCategoryModalOpen(true)
  }

  /**
   * @description Open the edit category modal
   * @param {DocumentCategory} cat - Category to edit
   */
  const handleEditCategory = (cat: DocumentCategory) => {
    setEditingCategory(cat)
    setCategoryModalOpen(true)
  }

  /**
   * @description Delete a category after confirmation
   * @param {string} categoryId - Category ID to delete
   */
  const handleDeleteCategory = async (categoryId: string) => {
    if (!projectId) return

    // Prompt confirmation before deletion
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('projects.deleteCategoryConfirm', 'This will delete the category and its dataset. This action cannot be undone.'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteDocumentCategory(projectId, categoryId)
      const catData = await getDocumentCategories(projectId)
      setAllCategories(catData)

      // Clear URL category param if the deleted category was active
      if (activeCategoryId === categoryId) {
        setSearchParams({ tab: activeTab })
      }
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /**
   * @description Submit category modal form (create or update)
   * @param {object} data - Form data from CategoryModal
   */
  const handleCategoryModalOk = async (data: { name: string; dataset_config: Record<string, any> }) => {
    if (!projectId) return

    setCategorySaving(true)
    try {
      if (editingCategory) {
        // Update existing category
        await updateDocumentCategory(projectId, editingCategory.id, data)
      } else {
        // Create new category with the active tab's category_type
        await createDocumentCategory(projectId, {
          ...data,
          category_type: activeTab,
        })
      }
      setCategoryModalOpen(false)
      setEditingCategory(null)

      // Refresh categories
      const catData = await getDocumentCategories(projectId)
      setAllCategories(catData)
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setCategorySaving(false)
    }
  }

  /**
   * @description Get the selected category for a given category list
   * @param {DocumentCategory[]} categories - Filtered category list
   * @returns {DocumentCategory | undefined} Selected category or undefined
   */
  const getSelectedCategory = (categories: DocumentCategory[]) => {
    if (!activeCategoryId) return undefined
    return categories.find(c => c.id === activeCategoryId)
  }

  /**
   * @description Render content area for Standard or Code tabs with null guard on dataset_id
   * @param {DocumentCategory | undefined} selectedCategory - Currently selected category
   * @returns {JSX.Element} Content area or placeholder
   */
  const renderStandardOrCodeContent = (selectedCategory: DocumentCategory | undefined) => {
    if (!selectedCategory) {
      // No category selected — prompt to select one
      return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          {t('projects.selectCategory', 'Select a category to view its content.')}
        </div>
      )
    }

    // Null guard for dataset_id — standard/code categories should have a linked dataset
    if (selectedCategory.dataset_id) {
      return (
        <div className="flex-1 p-4">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">{selectedCategory.name}</p>
            <p>{t('projects.datasetLinked', 'Dataset linked. Content management will be available in a future update.')}</p>
            <p className="text-xs mt-1 text-muted-foreground">
              Dataset ID: {selectedCategory.dataset_id}
            </p>
          </div>
        </div>
      )
    }

    // dataset_id is null — show fallback message
    return (
      <div className="flex-1 flex items-center justify-center h-full text-muted-foreground">
        {t('projects.datasetNotAvailable', 'Dataset not available for this category.')}
      </div>
    )
  }

  // ── Loading state ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  // ── Not found state ──────────────────────────────────────────────────

  if (!project) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-muted-foreground">{t('projects.loadError', 'Failed to load project. Check your connection and try again.')}</p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">
        {/* Back + title + status + settings gear */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/data-studio/projects')}
            className="mb-2"
          >
            <ArrowLeft size={16} className="mr-2" />
            {t('projectManagement.title')}
          </Button>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Display size per UI-SPEC typography contract */}
              <h1 className="text-[28px] font-semibold leading-[1.2] text-foreground">{project.name}</h1>
              <Badge variant={project.status === 'active' ? 'success' : 'secondary'}>
                {project.status}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {project.description && (
                <p className="text-muted-foreground text-sm mr-4">{project.description}</p>
              )}
              {/* Gear icon to open settings sheet */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={16} />
              </Button>
            </div>
          </div>
        </div>

        {/* 3 fixed category tabs per UI-SPEC */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="documents">
              <FolderOpen className="h-4 w-4 mr-1.5" />
              {t('projects.documentsTab', 'Documents')}
              <Badge variant="secondary" className="ml-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {documentCategories.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="standard">
              <FileText className="h-4 w-4 mr-1.5" />
              {t('projects.standardTab', 'Standard')}
              <Badge variant="secondary" className="ml-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {standardCategories.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="code">
              <Code2 className="h-4 w-4 mr-1.5" />
              {t('projects.codeTab', 'Code')}
              <Badge variant="secondary" className="ml-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {codeCategories.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Documents tab: CategorySidebar + existing DocumentsTab (versioned) */}
          <TabsContent value="documents">
            <div className="flex" style={{ minHeight: 400 }}>
              <CategorySidebar
                categories={documentCategories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={handleSelectCategory}
                onCreateCategory={handleCreateCategoryClick}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
                categoryType="documents"
              />
              <div className="flex-1 min-w-0">
                <DocumentsTab
                  projectId={projectId!}
                  initialCategories={documentCategories}
                  embeddingModels={[]}
                />
              </div>
            </div>
          </TabsContent>

          {/* Standard tab: CategorySidebar + content area with null guard */}
          <TabsContent value="standard">
            <div className="flex" style={{ minHeight: 400 }}>
              <CategorySidebar
                categories={standardCategories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={handleSelectCategory}
                onCreateCategory={handleCreateCategoryClick}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
                categoryType="standard"
              />
              {renderStandardOrCodeContent(getSelectedCategory(standardCategories))}
            </div>
          </TabsContent>

          {/* Code tab: CategorySidebar + content area with null guard */}
          <TabsContent value="code">
            <div className="flex" style={{ minHeight: 400 }}>
              <CategorySidebar
                categories={codeCategories}
                activeCategoryId={activeCategoryId}
                onSelectCategory={handleSelectCategory}
                onCreateCategory={handleCreateCategoryClick}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
                categoryType="code"
              />
              {renderStandardOrCodeContent(getSelectedCategory(codeCategories))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Settings sheet */}
      <ProjectSettingsSheet
        project={project}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onProjectUpdated={fetchProject}
        onProjectDeleted={() => navigate('/data-studio/projects')}
      />

      {/* Category create/edit modal — auto-sets category_type from active tab */}
      <CategoryModal
        open={categoryModalOpen}
        saving={categorySaving}
        editMode={!!editingCategory}
        initialData={editingCategory ? { name: editingCategory.name, dataset_config: editingCategory.dataset_config as Record<string, any> } : null}
        onOk={handleCategoryModalOk}
        onCancel={() => { setCategoryModalOpen(false); setEditingCategory(null) }}
        categoryType={activeTab}
      />
    </div>
  )
}

export default ProjectDetailPage
