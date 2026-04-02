/**
 * @fileoverview Redesigned Documents tab with 3-column progressive-reveal layout.
 *
 * Layout: Category column → Version column → Document list column.
 * Each column header has a [+] action button at the top.
 * Selecting a category reveals versions; selecting a version reveals documents.
 *
 * @module features/knowledge-base/components/DocumentsTabRedesigned
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Pencil, Trash2, MoreHorizontal, Archive,
  FolderOpen, Lock, GitBranch, FileText,
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

interface DocumentsTabRedesignedProps {
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
 * @description 3-column progressive-reveal Documents tab.
 * Column 1: Categories (with [+] at top)
 * Column 2: Versions for selected category (with [+] at top)
 * Column 3: Documents for selected version (with upload at top)
 *
 * @param {DocumentsTabRedesignedProps} props - Component props
 * @returns {JSX.Element} The rendered 3-column documents tab
 */
const DocumentsTabRedesigned = ({ knowledgeBaseId, initialCategories, embeddingModels }: DocumentsTabRedesignedProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // -- State --
  const [categories, setCategories] = useState<DocumentCategory[]>(initialCategories)
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | null>(null)
  const [versions, setVersions] = useState<DocumentCategoryVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<DocumentCategoryVersion | null>(null)
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [saving, setSaving] = useState(false)

  // Category modal state
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<DocumentCategory | null>(null)

  // Permission modal state
  const [permCategoryId, setPermCategoryId] = useState<string | null>(null)
  const [permCategoryName, setPermCategoryName] = useState('')

  // Version modal state
  const [versionModalOpen, setVersionModalOpen] = useState(false)
  const [editVersionModalOpen, setEditVersionModalOpen] = useState(false)
  const [editingVersion, setEditingVersion] = useState<DocumentCategoryVersion | null>(null)

  // Jobs modal state
  const [jobsModalOpen, setJobsModalOpen] = useState(false)
  const [activeJobCount, setActiveJobCount] = useState(0)

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
        setSelectedVersion(null)
      })
      .catch((err: unknown) => {
        console.error('Failed to load versions:', err)
        globalMessage.error(String(err))
      })
      .finally(() => setLoadingVersions(false))
  }, [knowledgeBaseId, selectedCategory])

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

  // -- Refresh helpers --

  /** Refresh categories from the API */
  const refreshCategories = async () => {
    const catData = await getDocumentCategories(knowledgeBaseId)
    // Filter to only document categories — API returns all types for the project
    const filtered = catData.filter(c => c.category_type === 'documents')
    setCategories(filtered)
    return filtered
  }

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

  // -- Category handlers --

  /** Create a new category */
  const handleCreateCategory = async (data: { name: string; dataset_config: Record<string, any> }) => {
    try {
      setSaving(true)
      // Include category_type so the backend assigns the correct type
      await createDocumentCategory(knowledgeBaseId, { ...data, category_type: 'documents' })
      setCategoryModalOpen(false)
      setEditingCategory(null)
      await refreshCategories()
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  /** Update an existing category */
  const handleUpdateCategory = async (data: { name: string; dataset_config: Record<string, any> }) => {
    if (!editingCategory) return
    try {
      setSaving(true)
      await updateDocumentCategory(knowledgeBaseId, editingCategory.id, data)
      setCategoryModalOpen(false)
      setEditingCategory(null)
      const catData = await refreshCategories()
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
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('knowledgeBase.categories.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteDocumentCategory(knowledgeBaseId, categoryId)
      await refreshCategories()
      if (selectedCategory?.id === categoryId) {
        setSelectedCategory(null)
      }
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  // -- Version handlers --

  /** Submit version creation */
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
        language: data.language,
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

  /** Delete a version after confirmation */
  const handleDeleteVersion = async (versionId: string) => {
    if (!selectedCategory) return
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

  /** Archive a version */
  const handleArchiveVersion = async (versionId: string) => {
    if (!selectedCategory) return
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

  // -- Render helpers --

  /** Map version status to Badge variant */
  const statusVariant = (status: string): 'success' | 'info' | 'secondary' => {
    const map: Record<string, 'success' | 'info' | 'secondary'> = { active: 'success', synced: 'info', archived: 'secondary' }
    return map[status] || 'secondary'
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-1 border-x border-t rounded-t-lg dark:border-slate-700 overflow-hidden min-h-0">
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* COLUMN 1: Categories                                          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col bg-muted/30">
          {/* Header with title + [+] button */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('knowledgeBase.categories.title')}
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
                <TooltipContent>{t('knowledgeBase.newCategory', 'New Category')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Category list */}
          <ScrollArea className="flex-1">
            {categories.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <FolderOpen size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t('knowledgeBase.emptyCategoryDescription', 'Create a category to start adding files.')}
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
                            {t('knowledgeBase.entityPermissions.title', 'Permissions')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditingCategory(cat); setCategoryModalOpen(true) }}>
                            <Pencil size={14} className="mr-2" />
                            {t('knowledgeBase.categories.edit')}
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
        {/* COLUMN 2: Versions                                            */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="w-52 shrink-0 border-r border-border flex flex-col bg-muted/15">
          {/* Header with title + [+] button */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('knowledgeBase.versions.title')}
            </h3>
            {selectedCategory && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setVersionModalOpen(true)}
                    >
                      <Plus size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('knowledgeBase.newVersion', 'New Version')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Version list */}
          <ScrollArea className="flex-1">
            {!selectedCategory ? (
              <div className="px-4 py-12 text-center">
                <GitBranch size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t('knowledgeBase.selectCategoryForVersions', 'Select a category to see versions')}
                </p>
              </div>
            ) : loadingVersions ? (
              <div className="flex flex-col gap-2 p-2">
                {[1, 2, 3].map((k) => (
                  <div key={k} className="h-12 bg-muted rounded-md animate-pulse" />
                ))}
              </div>
            ) : versions.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <GitBranch size={28} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {t('knowledgeBase.versions.noVersionsHint')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1 p-1.5">
                {versions.map((ver) => {
                  const isActive = ver.id === selectedVersion?.id
                  return (
                    <div
                      key={ver.id}
                      onClick={() => setSelectedVersion(ver)}
                      className={`group relative flex flex-col gap-0.5 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors
                        ${isActive
                          ? 'bg-accent border-l-2 border-primary'
                          : 'hover:bg-muted border-l-2 border-transparent'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground truncate">{ver.version_label}</span>
                        <Badge variant={statusVariant(ver.status)} className="text-[10px] px-1.5 py-0">
                          {t(`knowledgeBase.versions.status.${ver.status}`)}
                        </Badge>
                      </div>

                      {/* Action buttons on hover */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditingVersion(ver); setEditVersionModalOpen(true) }}
                              >
                                <Pencil size={10} />
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
                                  className="h-5 w-5"
                                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleArchiveVersion(ver.id) }}
                                >
                                  <Archive size={10} />
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
                                className="h-5 w-5 text-destructive hover:text-destructive"
                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleDeleteVersion(ver.id) }}
                              >
                                <Trash2 size={10} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t('common.delete')}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* COLUMN 3: Documents                                           */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Header with title */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('knowledgeBase.documents.title')}
            </h3>
          </div>

          {selectedVersion && selectedCategory ? (
            <div className="flex-1 overflow-auto">
              <DocumentListPanel
                knowledgeBaseId={knowledgeBaseId}
                categoryId={selectedCategory.id}
                versionId={selectedVersion.id}
                versionLabel={selectedVersion.version_label}
                onShowJobs={() => setJobsModalOpen(true)}
                activeJobCount={activeJobCount}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 px-4">
              <FileText size={32} className="text-muted-foreground/40" />
              <p className="text-sm">
                {!selectedCategory
                  ? t('knowledgeBase.selectCategory', 'Select a category to view its contents')
                  : t('knowledgeBase.selectVersionForDocs', 'Select a version to see documents')
                }
              </p>
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
    </div>
  )
}

export default DocumentsTabRedesigned
