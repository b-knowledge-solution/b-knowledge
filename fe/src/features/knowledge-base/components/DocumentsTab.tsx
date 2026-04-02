/**
 * @fileoverview Documents tab content for the knowledge base detail page.
 *
 * Layout: category sidebar (left) + version panel (right).
 * The version panel shows version chips, a document list, and an upload area.
 * Owns all category/version state and CRUD handlers.
 *
 * @module features/knowledge-base/components/DocumentsTab
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Pencil, Archive, FolderOpen, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'
import {
  getDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
  getCategoryVersions,
  createCategoryVersion,
  deleteCategoryVersion,
  archiveCategoryVersion,
  type DocumentCategory,
  type DocumentCategoryVersion,
} from '../api/knowledgeBaseApi'
import { getConverterJobs } from '../../system/api/converterApi'

import CategoryModal from './CategoryModal'
import VersionModal, { type VersionFormData } from './VersionModal'
import EditVersionModal from './EditVersionModal'
import DocumentListPanel from './DocumentListPanel'
import JobManagementModal from './JobManagementModal'
import { EntityPermissionModal } from './EntityPermissionModal'
import { PollInterval } from '@/constants'

// ============================================================================
// Types
// ============================================================================

interface DocumentsTabProps {
  /** Current project ID */
  knowledgeBaseId: string
  /** Initial category list fetched by the parent */
  initialCategories: DocumentCategory[]
  /** Available embedding models from the project's RAGFlow server */
  embeddingModels?: string[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * Documents tab -- category sidebar + version panel with document list.
 *
 * @param {DocumentsTabProps} props - Component props
 * @returns {JSX.Element} The rendered documents tab content
 */
const DocumentsTab = ({ knowledgeBaseId, initialCategories, embeddingModels }: DocumentsTabProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // -- State --
  const [categories, setCategories] = useState<DocumentCategory[]>(initialCategories)
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null)
  const [versions, setVersions] = useState<DocumentCategoryVersion[]>([])
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [permCategoryId, setPermCategoryId] = useState<string | null>(null)
  const [permCategoryName, setPermCategoryName] = useState('')
  const [versionModalOpen, setVersionModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [editingCategory, setEditingCategory] = useState<DocumentCategory | null>(null)

  // Edit version modal state
  const [editVersionModalOpen, setEditVersionModalOpen] = useState(false)
  const [editingVersion, setEditingVersion] = useState<DocumentCategoryVersion | null>(null)

  // Track selected version for upload area + document list
  const [selectedVersion, setSelectedVersion] = useState<DocumentCategoryVersion | null>(null)

  // Jobs modal state
  const [jobsModalOpen, setJobsModalOpen] = useState(false)
  const [activeJobCount, setActiveJobCount] = useState(0)

  // Fetch active job count for the jobs button badge
  useEffect(() => {
    if (!selectedCategory || !selectedVersion) return
    const fetchActiveCount = async () => {
      try {
        const result = await getConverterJobs({
          projectId: knowledgeBaseId,
          categoryId: selectedCategory.id,
          versionId: selectedVersion.id,
          page: 1,
          pageSize: 1,
        })
        // Count active jobs (pending/processing)
        const active = result.jobs.filter(
          (j) => j.status === 'pending' || j.status === 'converting',
        ).length
        setActiveJobCount(active)
      } catch {
        // Silent fail for badge count
      }
    }
    fetchActiveCount()
    const timer = setInterval(fetchActiveCount, PollInterval.DEFAULT)
    return () => clearInterval(timer)
  }, [selectedCategory, selectedVersion, knowledgeBaseId])

  // Sync with parent if initialCategories changes
  useEffect(() => {
    setCategories(initialCategories)
  }, [initialCategories])

  // Fetch versions when a category is selected
  useEffect(() => {
    if (!selectedCategory) {
      setVersions([])
      setSelectedVersion(null)
      return
    }
    setLoadingVersions(true)
    getCategoryVersions(knowledgeBaseId, selectedCategory.id)
      .then((data) => {
        setVersions(data)
        // Auto-select first active version
        const active = data.find((v) => v.status === 'active') || data[0]
        setSelectedVersion(active || null)
      })
      .catch((err: unknown) => {
        console.error('Failed to load versions:', err)
        globalMessage.error(String(err))
      })
      .finally(() => setLoadingVersions(false))
  }, [knowledgeBaseId, selectedCategory])

  // -- Handlers --

  /** Refresh versions for the currently selected category */
  const refreshVersions = async () => {
    if (!selectedCategory) return
    setLoadingVersions(true)
    try {
      const verData = await getCategoryVersions(knowledgeBaseId, selectedCategory.id)
      setVersions(verData)
    } finally {
      setLoadingVersions(false)
    }
  }

  /**
   * Create a new category.
   * Saves category with dataset_config to DB.
   * @param data - Category form data from CategoryModal
   */
  const handleCreateCategory = async (data: { name: string; dataset_config: Record<string, any> }) => {
    try {
      setSaving(true)
      // Include category_type so the backend assigns the correct type
      await createDocumentCategory(knowledgeBaseId, { ...data, category_type: 'documents' })
      setCategoryModalOpen(false)
      setEditingCategory(null)
      const catData = await getDocumentCategories(knowledgeBaseId)
      // Filter to only document categories — API returns all types for the project
      setCategories(catData.filter(c => c.category_type === 'documents'))
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /** Open edit modal for a category, pre-filling with its data */
  const handleOpenEditCategory = (cat: DocumentCategory) => {
    setEditingCategory(cat)
    setCategoryModalOpen(true)
  }

  /** Update an existing category */
  const handleUpdateCategory = async (data: { name: string; dataset_config: Record<string, any> }) => {
    if (!editingCategory) return
    try {
      setSaving(true)
      await updateDocumentCategory(knowledgeBaseId, editingCategory.id, data)
      setCategoryModalOpen(false)
      setEditingCategory(null)
      const catData = await getDocumentCategories(knowledgeBaseId)
      setCategories(catData)
      // Refresh selected category if it was the one edited
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

  /** Delete a category after confirmation */
  const handleDeleteCategory = async (categoryId: string) => {
    // Prompt confirmation before deleting the category
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('knowledgeBase.categories.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteDocumentCategory(knowledgeBaseId, categoryId)
      const catData = await getDocumentCategories(knowledgeBaseId)
      setCategories(catData)
      if (selectedCategory?.id === categoryId) {
        setSelectedCategory(null)
      }
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /** Delete a version after confirmation */
  const handleDeleteVersion = async (versionId: string) => {
    if (!selectedCategory) return

    // Prompt confirmation before deleting the version
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('knowledgeBase.versions.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteCategoryVersion(knowledgeBaseId, selectedCategory.id, versionId)
      if (selectedVersion?.id === versionId) setSelectedVersion(null)
      await refreshVersions()
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /** Deactivate (archive) a version after confirmation */
  const handleDeactivateVersion = async (versionId: string) => {
    if (!selectedCategory) return

    // Prompt confirmation before archiving the version
    const confirmed = await confirm({
      title: t('knowledgeBase.versions.deactivate'),
      message: t('knowledgeBase.versions.deactivateConfirm'),
      variant: 'warning',
      confirmText: t('knowledgeBase.versions.deactivate'),
    })
    if (!confirmed) return

    try {
      await archiveCategoryVersion(knowledgeBaseId, selectedCategory.id, versionId)
      globalMessage.success(t('knowledgeBase.versions.deactivateSuccess'))
      if (selectedVersion?.id === versionId) setSelectedVersion(null)
      await refreshVersions()
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /** Open edit version modal */
  const handleOpenEditVersion = (version: DocumentCategoryVersion) => {
    setEditingVersion(version)
    setEditVersionModalOpen(true)
  }

  /** Open version creation modal */
  const handleCreateVersion = () => {
    setVersionModalOpen(true)
  }

  /**
   * Submit version creation with duplicate check.
   * @param data - Version form data from VersionModal
   */
  const handleSubmitVersion = async (data: VersionFormData) => {
    if (!selectedCategory) return
    try {
      const version_label = data.version_label.trim()

      const duplicate = versions.find(
        (v) => v.version_label.toLowerCase() === version_label.toLowerCase()
      )
      if (duplicate) {
        globalMessage.error(t('knowledgeBase.versions.duplicateError'))
        return
      }

      setSaving(true)
      await createCategoryVersion(knowledgeBaseId, selectedCategory.id, {
        version_label,
        pagerank: data.pagerank ?? 0,
        ...(data.pipeline_id?.trim() ? { pipeline_id: data.pipeline_id.trim() } : {}),
        ...(data.parse_type != null ? { parse_type: data.parse_type } : {}),
        ...(data.chunk_method ? { chunk_method: data.chunk_method } : {}),
        parser_config: data.parser_config as Record<string, any>,
      })
      setVersionModalOpen(false)
      await refreshVersions()
      globalMessage.success(t('knowledgeBase.versions.syncSuccess'))
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  // -- Render --

  /**
   * Map version status to Badge variant.
   * @param status - Version status string
   * @returns Badge variant
   */
  const statusVariant = (status: string): 'success' | 'info' | 'secondary' => {
    const map: Record<string, 'success' | 'info' | 'secondary'> = { active: 'success', synced: 'info', archived: 'secondary' }
    return map[status] || 'secondary'
  }

  return (
    <>
      <div className="flex gap-6" style={{ minHeight: 400 }}>
        {/* -- Category sidebar -- */}
        <div className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 pr-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t('knowledgeBase.categories.title')}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { setEditingCategory(null); setCategoryModalOpen(true) }}
            >
              <Plus size={14} />
            </Button>
          </div>
          {categories.length === 0 ? (
            <div className="text-center py-8">
              <FolderOpen size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">{t('knowledgeBase.categories.noCategoriesHint')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-all duration-150 border-l-3
                    ${selectedCategory?.id === cat.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold border-l-blue-500 shadow-sm'
                      : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300 border-l-transparent hover:border-l-gray-300 dark:hover:border-l-slate-500'
                    }`}
                >
                  <span className="truncate">{cat.name}</span>
                  <div className="flex items-center gap-0.5">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setPermCategoryId(cat.id); setPermCategoryName(cat.name) }}
                          >
                            <Lock size={12} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('knowledgeBase.entityPermissions.title', 'Permissions')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleOpenEditCategory(cat) }}
                          >
                            <Pencil size={12} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('knowledgeBase.categories.edit')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('common.delete')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* -- Right panel: Versions + Documents -- */}
        <div className="flex-1 min-w-0">
          {selectedCategory ? (
            <div className="flex flex-col gap-4">
              {/* Version header + add button */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {t('knowledgeBase.versions.title')} — {selectedCategory.name}
                </h3>
                <Button size="sm" onClick={handleCreateVersion}>
                  <Plus size={14} className="mr-1" />
                  {t('knowledgeBase.versions.add')}
                </Button>
              </div>

              {/* Version chips/cards -- horizontal scrollable */}
              {loadingVersions ? (
                <div className="flex gap-2">
                  {[1, 2, 3].map((k) => (
                    <div key={k} className="h-16 w-40 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  {t('knowledgeBase.versions.noVersionsHint')}
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {versions.map((ver) => (
                    <div
                      key={ver.id}
                      onClick={() => setSelectedVersion(ver)}
                      className={`group relative flex flex-col gap-1 px-4 py-2.5 rounded-lg cursor-pointer border transition-all text-sm min-w-[140px]
                        ${selectedVersion?.id === ver.id
                          ? 'border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-slate-800'
                        }`}
                    >
                      {/* Version label + status */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                          {ver.version_label}
                        </span>
                        <Badge variant={statusVariant(ver.status)} className="text-xs">
                          {t(`projectManagement.versions.status.${ver.status}`)}
                        </Badge>
                      </div>

                      {/* Action buttons -- visible on hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleOpenEditVersion(ver) }}
                              >
                                <Pencil size={12} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('knowledgeBase.versions.editLabel')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {ver.status !== 'archived' && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeactivateVersion(ver.id) }}
                                >
                                  <Archive size={12} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('knowledgeBase.versions.deactivate')}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteVersion(ver.id) }}
                              >
                                <Trash2 size={12} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('common.delete')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Selected version content: document list with upload modals */}
              {selectedVersion && selectedCategory && (
                <>
                  <DocumentListPanel
                    knowledgeBaseId={knowledgeBaseId}
                    categoryId={selectedCategory.id}
                    versionId={selectedVersion.id}
                    versionLabel={selectedVersion.version_label}
                    onShowJobs={() => setJobsModalOpen(true)}
                    activeJobCount={activeJobCount}
                  />
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 gap-2">
              <FolderOpen size={40} className="text-gray-300" />
              <p className="text-sm">{t('knowledgeBase.categories.noCategoriesHint')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CategoryModal
        open={categoryModalOpen}
        saving={saving}
        editMode={!!editingCategory}
        embeddingModels={embeddingModels}
        initialData={editingCategory ? { name: editingCategory.name, dataset_config: editingCategory.dataset_config as Record<string, any> } : null}
        onOk={editingCategory ? handleUpdateCategory : handleCreateCategory}
        onCancel={() => { setCategoryModalOpen(false); setEditingCategory(null) }}
      />
      <VersionModal
        open={versionModalOpen}
        saving={saving}
        categoryConfig={selectedCategory?.dataset_config as Record<string, any> | undefined}
        onOk={handleSubmitVersion}
        onCancel={() => setVersionModalOpen(false)}
      />
      <EditVersionModal
        open={editVersionModalOpen}
        version={editingVersion}
        knowledgeBaseId={knowledgeBaseId}
        categoryId={selectedCategory?.id || ''}
        saving={saving}
        categoryConfig={selectedCategory?.dataset_config as Record<string, any> | undefined}
        onSavingChange={setSaving}
        onSaved={() => {
          setEditVersionModalOpen(false)
          refreshVersions()
        }}
        onCancel={() => setEditVersionModalOpen(false)}
      />
      {selectedCategory && selectedVersion && (
        <JobManagementModal
          open={jobsModalOpen}
          onClose={() => setJobsModalOpen(false)}
          knowledgeBaseId={knowledgeBaseId}
          categoryId={selectedCategory.id}
          versionId={selectedVersion.id}
          versionLabel={selectedVersion.version_label}
        />
      )}
      {permCategoryId && (
        <EntityPermissionModal
          open={!!permCategoryId}
          onClose={() => setPermCategoryId(null)}
          knowledgeBaseId={knowledgeBaseId}
          entityType="category"
          entityId={permCategoryId}
          entityName={permCategoryName}
        />
      )}
    </>
  )
}

export default DocumentsTab
