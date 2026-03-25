/**
 * @fileoverview Redesigned Standard tab with 2-column progressive-reveal layout.
 *
 * Layout: Category column -> Document list column.
 * Standard categories own a single dataset (no versions).
 * Selecting a category reveals its DocumentListPanel.
 *
 * @module features/projects/components/StandardTabRedesigned
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Pencil, Trash2, MoreHorizontal,
  FolderOpen, Lock, FileText, Settings, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'
import {
  getDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
  type DocumentCategory,
} from '../api/projectApi'

import CategoryModal from './CategoryModal'
import DocumentListPanel from './DocumentListPanel'
import { EntityPermissionModal } from './EntityPermissionModal'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the StandardTabRedesigned component
 */
interface StandardTabRedesignedProps {
  /** Current project ID */
  projectId: string
  /** Initial category list fetched by the parent */
  initialCategories: DocumentCategory[]
  /** Available embedding models from the project's RAGFlow server */
  embeddingModels?: string[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description 2-column progressive-reveal Standard tab.
 * Column 1: Categories (with [+] at top, context menu per item)
 * Column 2: DocumentListPanel for the selected category's dataset
 *
 * Standard categories own a single dataset — no version column needed.
 *
 * @param {StandardTabRedesignedProps} props - Component props
 * @returns {JSX.Element} The rendered 2-column standard tab
 */
const StandardTabRedesigned = ({ projectId, initialCategories, embeddingModels }: StandardTabRedesignedProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // -- State --
  const [categories, setCategories] = useState<DocumentCategory[]>(initialCategories)
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null)
  const [saving, setSaving] = useState(false)

  // Category modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<DocumentCategory | null>(null)

  // Permission modal state
  const [permCategoryId, setPermCategoryId] = useState<string | null>(null)
  const [permCategoryName, setPermCategoryName] = useState('')

  // Sync with parent if initialCategories changes
  useEffect(() => {
    setCategories(initialCategories)
  }, [initialCategories])

  // -- Refresh helpers --

  /**
   * @description Refresh categories from the API
   * @returns {Promise<DocumentCategory[]>} Updated category list
   */
  const refreshCategories = async () => {
    const catData = await getDocumentCategories(projectId)
    setCategories(catData)
    return catData
  }

  // -- Category handlers --

  /**
   * @description Create a new standard category
   * @param {object} data - Category form data with name and dataset_config
   */
  const handleCreateCategory = async (data: { name: string; dataset_config: Record<string, any> }) => {
    try {
      setSaving(true)
      await createDocumentCategory(projectId, data)
      setCategoryModalOpen(false)
      setEditingCategory(null)
      await refreshCategories()
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * @description Update an existing standard category
   * @param {object} data - Category form data with name and dataset_config
   */
  const handleUpdateCategory = async (data: { name: string; dataset_config: Record<string, any> }) => {
    if (!editingCategory) return
    try {
      setSaving(true)
      await updateDocumentCategory(projectId, editingCategory.id, data)
      setCategoryModalOpen(false)
      setEditingCategory(null)
      const catData = await refreshCategories()
      // Refresh selected category reference if it was the one edited
      if (selectedCategory?.id === editingCategory.id) {
        const updated = catData.find((c) => c.id === editingCategory.id)
        if (updated) setSelectedCategory(updated)
      }
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * @description Delete a category after user confirmation
   * @param {string} categoryId - ID of the category to delete
   */
  const handleDeleteCategory = async (categoryId: string) => {
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('projectManagement.categories.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteDocumentCategory(projectId, categoryId)
      await refreshCategories()
      // Clear selection if the deleted category was selected
      if (selectedCategory?.id === categoryId) {
        setSelectedCategory(null)
      }
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  // -- Render helpers --

  // Extract parser config summary for the header badge
  const parserSummary = selectedCategory?.dataset_config?.chunk_method || 'naive'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-1 border rounded-t-lg dark:border-slate-700 overflow-hidden min-h-0">
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* COLUMN 1: Categories                                          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col bg-muted/30">
          {/* Header with title + [+] button */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('projectManagement.categories.title')}
            </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => { setEditingCategory(null); setCategoryModalOpen(true) }}
                  >
                    <Plus size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('projects.newCategory', 'New Category')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Category list */}
          <ScrollArea className="flex-1">
            {categories.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FolderOpen size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t('projects.emptyCategoryDescription', 'Create a category to start adding files.')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 p-1.5">
                {categories.map((cat) => {
                  const isActive = cat.id === selectedCategory?.id
                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat)}
                      className={`group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-sm transition-colors
                        ${isActive
                          ? 'bg-accent border-l-2 border-primary font-medium'
                          : 'hover:bg-muted border-l-2 border-transparent'
                        }`}
                    >
                      <div className="min-w-0 flex-1 mr-1">
                        <p className="truncate text-foreground">{cat.name}</p>
                      </div>

                      {/* Context menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          >
                            <MoreHorizontal size={12} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); setPermCategoryId(cat.id); setPermCategoryName(cat.name) }}>
                            <Lock size={14} className="mr-2" />
                            {t('projectManagement.entityPermissions.title', 'Permissions')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditingCategory(cat); setCategoryModalOpen(true) }}>
                            <Pencil size={14} className="mr-2" />
                            {t('projectManagement.categories.edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                          >
                            <Trash2 size={14} className="mr-2" />
                            {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* COLUMN 2: Document list for selected category                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="flex-1 min-w-0 flex flex-col bg-muted/15">
          {/* Header with category name + parser config badge */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('projectManagement.documents.title')}
              </h3>
              {/* Show parser config badge when a category is selected */}
              {selectedCategory && (
                <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px]">
                  <Settings className="h-3 w-3 mr-1" />
                  {parserSummary}
                </Badge>
              )}
            </div>
          </div>

          {/* Content area: conditional on selection and dataset availability */}
          {!selectedCategory ? (
            // No category selected — show empty state
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 px-4">
              <FileText size={32} className="text-muted-foreground/40" />
              <p className="text-sm">
                {t('projects.selectCategory', 'Select a category to view its contents')}
              </p>
            </div>
          ) : !selectedCategory.dataset_id ? (
            // Category selected but dataset_id missing — show error state
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 px-4">
              <AlertCircle size={32} className="text-destructive/60" />
              <p className="text-sm text-destructive">
                {t('projects.datasetNotAvailable', 'Dataset not available')}
              </p>
            </div>
          ) : (
            // Category with valid dataset — show document list
            <div className="flex-1 overflow-auto">
              <DocumentListPanel
                projectId={projectId}
                categoryId={selectedCategory.id}
                versionId={selectedCategory.dataset_id}
              />
            </div>
          )}
        </div>
      </div>

      {/* ═══ Modals ═══ */}
      <CategoryModal
        open={categoryModalOpen}
        saving={saving}
        editMode={!!editingCategory}
        embeddingModels={embeddingModels}
        categoryType="standard"
        initialData={editingCategory ? { name: editingCategory.name, dataset_config: editingCategory.dataset_config as Record<string, any> } : null}
        onOk={editingCategory ? handleUpdateCategory : handleCreateCategory}
        onCancel={() => { setCategoryModalOpen(false); setEditingCategory(null) }}
      />
      {permCategoryId && (
        <EntityPermissionModal
          open={!!permCategoryId}
          onClose={() => setPermCategoryId(null)}
          projectId={projectId}
          entityType="category"
          entityId={permCategoryId}
          entityName={permCategoryName}
        />
      )}
    </div>
  )
}

export default StandardTabRedesigned
