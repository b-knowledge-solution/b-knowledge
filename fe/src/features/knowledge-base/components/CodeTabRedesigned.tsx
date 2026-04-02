/**
 * @fileoverview IDE-style Code tab with dark sidebar, source import panel,
 * pipeline status bar, document list, and first-class code graph panel.
 *
 * Layout: Dark category sidebar -> Content area (CodeSourcePanel, PipelineStatusBar,
 * DocumentListPanel, CodeGraphPanel always visible).
 * Code categories own a single dataset (no versions).
 *
 * @module features/knowledge-base/components/CodeTabRedesigned
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, MoreHorizontal,
  FolderOpen, Lock, FileText, Code2, AlertCircle,
  ExternalLink,
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
} from '../api/knowledgeBaseApi'

import { useCodeGraphStats, useCodeGraphData } from '@/features/code-graph'
import ForceGraph from '@/features/code-graph/components/ForceGraph'

import CodeCategoryModal from './CodeCategoryModal'
import CodeSourcePanel from './CodeSourcePanel'
import PipelineStatusBar from './PipelineStatusBar'
import DocumentListPanel from './DocumentListPanel'
import { EntityPermissionModal } from './EntityPermissionModal'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the CodeTabRedesigned component
 */
interface CodeTabRedesignedProps {
  /** Current project ID */
  knowledgeBaseId: string
  /** Initial category list fetched by the parent */
  initialCategories: DocumentCategory[]
  /** Available embedding models from the project's RAGFlow server */
  embeddingModels?: string[]
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Always-visible code graph panel (not collapsible).
 * Shows ForceGraph canvas when graph data exists, compact empty message otherwise.
 * Includes a "View Full Graph" navigation button.
 *
 * @param {object} props - Panel props
 * @param {string} props.datasetId - The dataset/knowledge base ID for graph queries
 * @returns {JSX.Element} The code graph panel
 */
const CodeGraphPanel = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Fetch graph stats for the node count badge (lightweight call)
  const { data: stats } = useCodeGraphStats(datasetId)

  // Always fetch graph data since the panel is always visible
  const { data: graphData, isLoading: graphLoading } = useCodeGraphData(datasetId, 500)

  // Compute total node count from stats for the badge
  const totalNodes = stats?.nodes?.reduce((sum, n) => sum + n.count, 0) ?? 0

  return (
    <div className="border-t border-border">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 dark:bg-muted/10">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            {t('knowledgeBase.codeGraphTitle', 'Code Graph')}
          </span>
          {/* Node count badge */}
          {totalNodes > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {totalNodes} {t('knowledgeBase.codeGraphNodes', 'nodes')}
            </Badge>
          )}
        </div>
        {/* View Full Graph button */}
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => navigate(`/code-graph/${datasetId}`)}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          {t('knowledgeBase.viewFullGraph', 'View Full Graph')}
        </Button>
      </div>

      {/* Graph content area */}
      <div className="px-4 py-3 bg-muted/20 dark:bg-muted/10">
        {/* Loading spinner */}
        {graphLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Graph visualization when data exists */}
        {!graphLoading && graphData && graphData.nodes.length > 0 && (
          <div className="rounded-lg overflow-hidden">
            <ForceGraph
              nodes={graphData.nodes}
              links={graphData.links}
              width={800}
              height={300}
            />
          </div>
        )}

        {/* Compact empty state when no graph data */}
        {!graphLoading && (!graphData || graphData.nodes.length === 0) && (
          <div className="text-center py-4">
            <Code2 size={20} className="mx-auto text-muted-foreground/30 mb-1" />
            <p className="text-xs text-muted-foreground/60">
              {t('knowledgeBase.codeGraphEmpty', 'No code graph data available. Upload and parse code files to generate the graph.')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description IDE-style Code tab with dark sidebar, import panel, pipeline status,
 * document list, and first-class code graph visualization.
 *
 * Left: Dark sidebar with monospace category list and `>` prefix for active item.
 * Right: Stacked content -- CodeSourcePanel, PipelineStatusBar, DocumentListPanel, CodeGraphPanel.
 *
 * @param {CodeTabRedesignedProps} props - Component props
 * @returns {JSX.Element} The rendered IDE-style code tab
 */
const CodeTabRedesigned = ({ knowledgeBaseId, initialCategories, embeddingModels: _embeddingModels }: CodeTabRedesignedProps) => {
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
   * @description Refresh categories from the API after mutations
   * @returns {Promise<DocumentCategory[]>} Updated category list
   */
  const refreshCategories = async () => {
    const catData = await getDocumentCategories(knowledgeBaseId)
    // Filter to only code categories — API returns all types for the project
    const filtered = catData.filter(c => c.category_type === 'code')
    setCategories(filtered)
    return filtered
  }

  // -- Category handlers --

  /**
   * @description Create a new code category
   * @param {object} data - Category form data with name and dataset_config
   */
  const handleCreateCategory = async (data: { name: string; dataset_config: Record<string, any> }) => {
    try {
      setSaving(true)
      // Include category_type so the backend assigns the correct type
      await createDocumentCategory(knowledgeBaseId, { ...data, category_type: 'code' })
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
   * @description Update an existing code category
   * @param {object} data - Category form data with name and dataset_config
   */
  const handleUpdateCategory = async (data: { name: string; dataset_config: Record<string, any> }) => {
    if (!editingCategory) return
    try {
      setSaving(true)
      await updateDocumentCategory(knowledgeBaseId, editingCategory.id, data)
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
      message: t('knowledgeBase.categories.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteDocumentCategory(knowledgeBaseId, categoryId)
      await refreshCategories()
      // Clear selection if the deleted category was selected
      if (selectedCategory?.id === categoryId) {
        setSelectedCategory(null)
      }
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /**
   * @description Callback when an import completes to refresh document list
   */
  const handleImportComplete = () => {
    // Refresh categories to pick up any document count changes
    refreshCategories()
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-1 border rounded-t-lg dark:border-slate-700 overflow-hidden min-h-0">
        {/* ================================================================= */}
        {/* SIDEBAR: Dark category list with monospace font and > prefix       */}
        {/* ================================================================= */}
        <div className="w-56 shrink-0 border-r border-slate-800 flex flex-col bg-slate-900 dark:bg-slate-900">
          {/* Sidebar header with title + [+] button */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800">
            <h3 className="text-xs font-mono font-semibold text-slate-400 uppercase tracking-wide">
              {t('knowledgeBase.categories.title')}
            </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
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
                <FolderOpen size={28} className="mx-auto text-slate-600 mb-2" />
                <p className="text-xs text-slate-500 font-mono">
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
                      className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer font-mono text-xs transition-colors
                        ${isActive
                          ? 'bg-slate-800 text-slate-200'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
                        }`}
                    >
                      <div className="min-w-0 flex-1 mr-1 flex items-center gap-1.5">
                        {/* Active indicator: > prefix instead of border-l */}
                        <span className={`${isActive ? 'text-emerald-400' : 'text-transparent'}`}>&gt;</span>
                        <p className="truncate">{cat.name}</p>
                      </div>

                      {/* Context menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-slate-300 hover:bg-slate-700"
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

        {/* ================================================================= */}
        {/* CONTENT: Source panel, pipeline bar, documents, graph              */}
        {/* ================================================================= */}
        <div className="flex-1 min-w-0 flex flex-col bg-background">
          {/* Header with category name + code badge */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('knowledgeBase.documents.title')}
              </h3>
              {/* Code badge when a category is selected */}
              {selectedCategory && (
                <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px]">
                  <Code2 className="h-3 w-3 mr-1" />
                  {t('knowledgeBase.codeTab', 'Code')}
                </Badge>
              )}
            </div>
          </div>

          {/* Content area: conditional on selection and dataset availability */}
          {!selectedCategory ? (
            // No category selected -- show empty state
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 px-4">
              <FileText size={32} className="text-muted-foreground/40" />
              <p className="text-sm">
                {t('knowledgeBase.selectCategory', 'Select a category to view its contents')}
              </p>
            </div>
          ) : !selectedCategory.dataset_id ? (
            // Category selected but dataset_id missing -- show error state
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 px-4">
              <AlertCircle size={32} className="text-destructive/60" />
              <p className="text-sm text-destructive">
                {t('knowledgeBase.datasetNotAvailable', 'Dataset not available')}
              </p>
            </div>
          ) : (
            // Category with valid dataset -- show full content stack
            <div className="flex-1 flex flex-col min-h-0 overflow-auto">
              {/* Import source panel at top */}
              <CodeSourcePanel
                knowledgeBaseId={knowledgeBaseId}
                categoryId={selectedCategory.id}
                datasetId={selectedCategory.dataset_id}
                onImportComplete={handleImportComplete}
              />

              {/* Pipeline status terminal strip */}
              <PipelineStatusBar
                datasetId={selectedCategory.dataset_id}
                knowledgeBaseId={knowledgeBaseId}
                categoryId={selectedCategory.id}
              />

              {/* Document list in the middle */}
              <div className="flex-1">
                <DocumentListPanel
                  knowledgeBaseId={knowledgeBaseId}
                  categoryId={selectedCategory.id}
                  versionId={selectedCategory.dataset_id}
                />
              </div>

              {/* Code graph panel -- always visible, not collapsible */}
              <CodeGraphPanel datasetId={selectedCategory.dataset_id} />
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* Modals                                                             */}
      {/* ================================================================= */}
      <CodeCategoryModal
        open={categoryModalOpen}
        saving={saving}
        editMode={!!editingCategory}
        initialData={editingCategory ? { name: editingCategory.name, dataset_config: editingCategory.dataset_config as Record<string, any> } : null}
        onOk={editingCategory ? handleUpdateCategory : handleCreateCategory}
        onCancel={() => { setCategoryModalOpen(false); setEditingCategory(null) }}
      />
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

export default CodeTabRedesigned
