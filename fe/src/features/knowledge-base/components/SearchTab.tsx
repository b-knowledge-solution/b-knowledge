/**
 * @fileoverview Search tab content for the knowledge base detail page.
 *
 * Displays the AI Search app list with add/edit/delete/sync actions.
 * Resolves category selections into ragflow_dataset_ids on search creation/update.
 *
 * @module features/knowledge-base/components/SearchTab
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, RefreshCw, Pencil, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirm } from '@/components/ConfirmDialog'
import { globalMessage } from '@/app/App'
import {
  getKnowledgeBaseSearches,
  createKnowledgeBaseSearch,
  updateKnowledgeBaseSearch,
  deleteKnowledgeBaseSearch,
  syncKnowledgeBaseSearch,
  type KnowledgeBaseSearch,
  type DocumentCategory,
  type DocumentCategoryVersion,
} from '../api/knowledgeBaseApi'
import SearchModal, { type SearchFormData } from './SearchModal'
import { EntityPermissionModal } from './EntityPermissionModal'

// ============================================================================
// Types
// ============================================================================

interface SearchTabProps {
  /** Current project ID */
  knowledgeBaseId: string
  /** Initial search list fetched by the parent */
  initialSearches: KnowledgeBaseSearch[]
  /** Knowledge base document categories */
  categories: DocumentCategory[]
  /** Map of category ID -> its versions (pre-fetched by parent) */
  categoryVersions: Record<string, DocumentCategoryVersion[]>
  /** Available chat models from the RAGFlow server config */
  chatModels: string[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Search tab displaying AI Search app list with full CRUD operations.
 * Resolves selected categories into ragflow_dataset_ids on creation/update.
 * @param {SearchTabProps} props - Component props with project data and category versions
 * @returns {JSX.Element} Rendered search tab content
 */
const SearchTab = ({
  knowledgeBaseId,
  initialSearches,
  categories,
  categoryVersions,
  chatModels,
}: SearchTabProps) => {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // List state
  const [searches, setSearches] = useState<KnowledgeBaseSearch[]>(initialSearches)
  const [loading, setLoading] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingSearch, setEditingSearch] = useState<KnowledgeBaseSearch | null>(null)
  const [saving, setSaving] = useState(false)
  const [permSearchId, setPermSearchId] = useState<string | null>(null)
  const [permSearchName, setPermSearchName] = useState('')

  // Sync initial data
  useEffect(() => {
    setSearches(initialSearches)
  }, [initialSearches])

  /**
   * Refresh searches list from API.
   */
  const refreshSearches = async () => {
    try {
      setLoading(true)
      const data = await getKnowledgeBaseSearches(knowledgeBaseId)
      setSearches(data)
    } catch {
      globalMessage.error(t('projectManagement.searches.fetchError', 'Failed to fetch search apps'))
    } finally {
      setLoading(false)
    }
  }

  /**
   * Resolve selected category IDs -> ragflow_dataset_ids.
   * @param selectedCategoryIds - Array of category IDs
   * @returns Array of ragflow dataset IDs
   */
  const resolveRagflowDatasetIds = (selectedCategoryIds: string[]): string[] => {
    const ids: string[] = []
    for (const catId of selectedCategoryIds) {
      const versions = categoryVersions[catId] || []
      for (const v of versions) {
        if (v.ragflow_dataset_id) {
          ids.push(v.ragflow_dataset_id)
        }
      }
    }
    return ids
  }

  /**
   * Open create modal.
   */
  const handleAdd = () => {
    setIsEditing(false)
    setEditingSearch(null)
    setModalOpen(true)
  }

  /**
   * Open edit modal.
   * @param record - Search record to edit
   */
  const handleEdit = (record: KnowledgeBaseSearch) => {
    setIsEditing(true)
    setEditingSearch(record)
    setModalOpen(true)
  }

  /**
   * Delete a search app after confirmation.
   * @param id - Search ID to delete
   */
  const handleDelete = async (id: string) => {
    // Prompt user for confirmation before deleting
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('projectManagement.searches.deleteConfirm', 'Delete this search app?'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await deleteKnowledgeBaseSearch(knowledgeBaseId, id)
      globalMessage.success(t('projectManagement.searches.deleteSuccess', 'Search app deleted'))
      refreshSearches()
    } catch {
      globalMessage.error(t('projectManagement.searches.deleteError', 'Failed to delete search app'))
    }
  }

  /**
   * Sync a search from RAGFlow.
   * @param id - Search ID to sync
   */
  const handleSync = async (id: string) => {
    try {
      await syncKnowledgeBaseSearch(knowledgeBaseId, id)
      globalMessage.success(t('projectManagement.searches.syncSuccess', 'Search app synced'))
      refreshSearches()
    } catch {
      globalMessage.error(t('projectManagement.searches.syncError', 'Failed to sync search app'))
    }
  }

  /**
   * Save handler for create/update.
   * @param values - Form values from SearchModal
   */
  const handleSave = async (values: SearchFormData) => {
    try {
      setSaving(true)
      const selectedCategoryIds: string[] = values.dataset_ids || []
      const ragflowDatasetIds = resolveRagflowDatasetIds(selectedCategoryIds)

      const payload = {
        name: values.name,
        description: values.description,
        dataset_ids: selectedCategoryIds,
        ragflow_dataset_ids: ragflowDatasetIds,
        search_config: values.search_config || {},
      }

      if (isEditing && editingSearch) {
        await updateKnowledgeBaseSearch(knowledgeBaseId, editingSearch.id, payload)
        globalMessage.success(t('projectManagement.searches.updateSuccess', 'Search app updated'))
      } else {
        await createKnowledgeBaseSearch(knowledgeBaseId, payload)
        globalMessage.success(t('projectManagement.searches.createSuccess', 'Search app created'))
      }

      setModalOpen(false)
      refreshSearches()
    } catch (err: any) {
      globalMessage.error(err.message || t('projectManagement.searches.saveError', 'Failed to save search app'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Resolve dataset_ids (category IDs) to category names for display.
   */
  const categoryMap: Record<string, string> = {}
  categories.forEach((c) => { categoryMap[c.id] = c.name })

  // -- Render --

  return (
    <>
      {/* Toolbar */}
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={handleAdd}>
          <Plus size={16} className="mr-1" />
          {t('projectManagement.searches.addSearch', 'Add Search')}
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : searches.length === 0 ? (
        <EmptyState
          description={t('projectManagement.searches.noSearches', 'No search apps yet. Click "Add Search" to create one.')}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[25%]">{t('projectManagement.searches.name', 'Name')}</TableHead>
              <TableHead className="w-[25%]">{t('projectManagement.searches.description', 'Description')}</TableHead>
              <TableHead className="w-[25%]">{t('projectManagement.searches.datasets', 'Datasets')}</TableHead>
              <TableHead className="w-[10%]">{t('projectManagement.searches.ragflowId', 'RAGFlow ID')}</TableHead>
              <TableHead className="w-[15%]">{t('projectManagement.searches.actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {searches.map((record) => (
              <TableRow key={record.id}>
                {/* Name */}
                <TableCell>{record.name}</TableCell>

                {/* Description */}
                <TableCell>{record.description || '—'}</TableCell>

                {/* Datasets */}
                <TableCell>
                  {record.dataset_ids && record.dataset_ids.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {record.dataset_ids.map((id) => (
                        <Badge key={id} variant="info" className="mb-0.5">
                          {categoryMap[id] || id}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    '—'
                  )}
                </TableCell>

                {/* RAGFlow ID */}
                <TableCell>
                  {record.ragflow_search_id ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {record.ragflow_search_id.substring(0, 8)}...
                    </Badge>
                  ) : (
                    '—'
                  )}
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => { setPermSearchId(record.id); setPermSearchName(record.name) }}
                          >
                            <Lock size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('projectManagement.entityPermissions.title', 'Permissions')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEdit(record)}
                          >
                            <Pencil size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('projectManagement.searches.edit', 'Edit')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleSync(record.id)}
                            disabled={!record.ragflow_search_id}
                          >
                            <RefreshCw size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('projectManagement.searches.sync', 'Sync')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(record.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('projectManagement.searches.delete', 'Delete')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create/Edit Modal */}
      <SearchModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={refreshSearches}
        isEditing={isEditing}
        editingSearch={editingSearch}
        categories={categories}
        categoryVersions={categoryVersions}
        chatModels={chatModels}
        onSave={handleSave}
        saving={saving}
      />
      {permSearchId && (
        <EntityPermissionModal
          open={!!permSearchId}
          onClose={() => setPermSearchId(null)}
          knowledgeBaseId={knowledgeBaseId}
          entityType="search"
          entityId={permSearchId}
          entityName={permSearchName}
        />
      )}
    </>
  )
}

export default SearchTab
