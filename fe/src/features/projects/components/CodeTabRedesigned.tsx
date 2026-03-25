/**
 * @fileoverview Redesigned Code tab with 2-column progressive-reveal layout and code graph panel.
 *
 * Layout: Category column -> Content area (document list + collapsible code graph).
 * Code categories own a single dataset (no versions).
 * Selecting a category reveals its documents and code graph visualization.
 *
 * @module features/projects/components/CodeTabRedesigned
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, MoreHorizontal,
  FolderOpen, Lock, FileText, Code2, AlertCircle,
  ChevronDown, ChevronRight, ExternalLink,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'
import {
  getDocumentCategories,
  createDocumentCategory,
  updateDocumentCategory,
  deleteDocumentCategory,
  type DocumentCategory,
} from '../api/projectApi'

import { useCodeGraphStats, useCodeGraphData } from '@/features/code-graph'
import ForceGraph from '@/features/code-graph/components/ForceGraph'

import CodeCategoryModal from './CodeCategoryModal'
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
  projectId: string
  /** Initial category list fetched by the parent */
  initialCategories: DocumentCategory[]
  /** Available embedding models from the project's RAGFlow server */
  embeddingModels?: string[]
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Collapsible code graph visualization panel.
 * Shows a trigger bar with "Code Graph" label, node count badge,
 * and when expanded, renders the ForceGraph canvas and "View Full Graph" button.
 *
 * @param {object} props - Panel props
 * @param {string} props.datasetId - The dataset/knowledge base ID for graph queries
 * @returns {JSX.Element} The collapsible code graph panel
 */
const CodeGraphPanel = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Track collapse state — starts collapsed to avoid expensive graph load on selection
  const [isOpen, setIsOpen] = useState(false)

  // Fetch graph stats for the node count badge (lightweight call, always active)
  const { data: stats } = useCodeGraphStats(datasetId)

  // Fetch full graph data only when the panel is expanded
  const { data: graphData, isLoading: graphLoading } = useCodeGraphData(
    isOpen ? datasetId : '',
    500,
  )

  // Compute total node count from stats for the badge
  const totalNodes = stats?.nodes?.reduce((sum, n) => sum + n.count, 0) ?? 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      {/* Trigger bar */}
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:bg-accent/50 dark:hover:bg-accent/20 transition-colors border-t border-border">
          {/* Chevron indicator for collapse state */}
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Code2 className="h-4 w-4" />
          <span>{t('projects.codeGraphTitle', 'Code Graph')}</span>
          {/* Node count badge */}
          {totalNodes > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
              {totalNodes} {t('projects.codeGraphNodes', 'nodes')}
            </Badge>
          )}
        </button>
      </CollapsibleTrigger>

      {/* Expanded graph content */}
      <CollapsibleContent>
        <div className="px-4 py-3 bg-muted/50 dark:bg-muted/20 border-t border-border">
          {/* Graph loading state */}
          {graphLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Graph visualization */}
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

          {/* Empty graph state */}
          {!graphLoading && (!graphData || graphData.nodes.length === 0) && (
            <div className="text-center py-6">
              <Code2 size={24} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-xs text-muted-foreground">
                {t('projects.codeGraphEmpty', 'No code graph data available. Upload and parse code files to generate the graph.')}
              </p>
            </div>
          )}

          {/* View Full Graph button */}
          <div className="flex justify-end mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/code-graph/${datasetId}`)}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {t('projects.viewFullGraph', 'View Full Graph')}
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description 2-column progressive-reveal Code tab with code graph panel.
 * Column 1: Categories (with [+] at top, context menu per item)
 * Column 2: Split vertically — DocumentListPanel on top, collapsible code graph below
 *
 * Code categories own a single dataset — no version column needed.
 *
 * @param {CodeTabRedesignedProps} props - Component props
 * @returns {JSX.Element} The rendered 2-column code tab with graph panel
 */
const CodeTabRedesigned = ({ projectId, initialCategories, embeddingModels }: CodeTabRedesignedProps) => {
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
   * @description Create a new code category
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
   * @description Update an existing code category
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
        {/* COLUMN 2: Content area (documents + code graph)               */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="flex-1 min-w-0 flex flex-col bg-muted/15">
          {/* Header with category name + code badge */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t('projectManagement.documents.title')}
              </h3>
              {/* Show code badge when a category is selected */}
              {selectedCategory && (
                <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px]">
                  <Code2 className="h-3 w-3 mr-1" />
                  {t('projects.codeTab', 'Code')}
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
            // Category with valid dataset — show document list + code graph
            <div className="flex-1 flex flex-col min-h-0">
              {/* Top section: Document list */}
              <div className="flex-1 overflow-auto">
                <DocumentListPanel
                  projectId={projectId}
                  categoryId={selectedCategory.id}
                  versionId={selectedCategory.dataset_id}
                />
              </div>

              {/* Bottom section: Collapsible code graph panel */}
              <CodeGraphPanel datasetId={selectedCategory.dataset_id} />
            </div>
          )}
        </div>
      </div>

      {/* ═══ Modals ═══ */}
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
          projectId={projectId}
          entityType="category"
          entityId={permCategoryId}
          entityName={permCategoryName}
        />
      )}
    </div>
  )
}

export default CodeTabRedesigned
