/**
 * @fileoverview LLM Provider administration page.
 *
 * Two-section layout:
 * 1. System Default Models panel — compact grid to view/set defaults per type.
 * 2. All Providers table — filterable, paginated list with vision indicator,
 *    CRUD actions, and dialog form.
 *
 * @module features/llm-provider/pages/LLMProviderPage
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HeaderActions } from '@/components/HeaderActions'
import { useConfirm } from '@/components/ConfirmDialog'
import { DefaultModelsPanel } from '../components/DefaultModelsPanel'
import { ProviderFormDialog } from '../components/ProviderFormDialog'
import {
  getProviders,
  getPresets,
  createProvider,
  updateProvider,
  deleteProvider,
} from '../api/llmProviderApi'
import { MODEL_TYPES } from '../types/llmProvider.types'
import type { ModelProvider, CreateProviderDTO, UpdateProviderDTO } from '../types/llmProvider.types'

// ============================================================================
// Constants
// ============================================================================

/** Number of rows per page */
const PAGE_SIZE = 10

/** Filter tabs: "all" plus each model type */
const TYPE_FILTERS = ['all', ...MODEL_TYPES] as const

/** Color classes for model type badges in the table */
const MODEL_TYPE_BADGE_CLASSES: Record<string, string> = {
  chat: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  embedding: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  image2text: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  speech2text: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  rerank: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  tts: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
}

/** Short display labels for model types in filter tabs and badges */
const MODEL_TYPE_LABELS: Record<string, string> = {
  chat: 'LLM',
  embedding: 'Embedding',
  image2text: 'VLM',
  speech2text: 'ASR',
  rerank: 'Rerank',
  tts: 'TTS',
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check whether a chat provider has a matching image2text sibling
 * (same factory_name + model_name).
 *
 * @param provider - The chat provider to check
 * @param allProviders - Full list of providers
 * @returns True if a vision sibling exists
 */
function hasVisionSibling(provider: ModelProvider, allProviders: ModelProvider[]): boolean {
  if (provider.model_type !== 'chat') return false
  return allProviders.some(
    (p) =>
      p.model_type === 'image2text' &&
      p.factory_name === provider.factory_name &&
      p.model_name === provider.model_name
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * Admin page for managing LLM providers with a two-section layout.
 *
 * @returns React element
 */
export function LLMProviderPage() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  // -- Data via TanStack Query (deduplicated, cached) -----------------------
  const {
    data: providers = [],
    isLoading: loading,
  } = useQuery({
    queryKey: queryKeys.llmProvider.list(),
    queryFn: getProviders,
  })

  const { data: presets = [] } = useQuery({
    queryKey: queryKeys.llmProvider.presets(),
    queryFn: getPresets,
  })

  /**
   * Invalidate providers cache to trigger refetch.
   */
  const fetchProviders = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.llmProvider.list() })

  // -- Filter and pagination state -------------------------------------------
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  // -- Dialog state ----------------------------------------------------------
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null)

  // -- Derived data ----------------------------------------------------------

  // Apply model_type filter
  const filtered = typeFilter === 'all'
    ? providers
    : providers.filter((p) => p.model_type === typeFilter)

  // Total pages for pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  // Clamp current page
  const safePage = Math.min(page, totalPages)

  // Slice for current page
  const pageData = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // -- Handlers --------------------------------------------------------------

  /** Open dialog in create mode */
  const handleAdd = () => {
    setEditingProvider(null)
    setDialogOpen(true)
  }

  /** Open dialog in edit mode */
  const handleEdit = (provider: ModelProvider) => {
    setEditingProvider(provider)
    setDialogOpen(true)
  }

  /**
   * Handle dialog form submission (create or update).
   * @param data - Provider payload from the form
   */
  const handleSubmit = async (data: CreateProviderDTO | UpdateProviderDTO) => {
    if (editingProvider) {
      // Update existing provider
      await updateProvider(editingProvider.id, data as UpdateProviderDTO)
      toast.success(t('llmProviders.providerSaved'))
    } else {
      // Create new provider
      await createProvider(data as CreateProviderDTO)
      toast.success(t('llmProviders.providerSaved'))
    }
    // Refresh the list after mutation
    await fetchProviders()
  }

  /**
   * Prompt for confirmation then soft-delete a provider.
   * @param provider - Provider to delete
   */
  const handleDelete = async (provider: ModelProvider) => {
    const confirmed = await confirm({
      title: t('llmProviders.deleteTitle'),
      message: t('llmProviders.deleteMessage', { name: provider.model_name }),
      variant: 'danger',
      confirmText: t('common.delete'),
    })

    if (!confirmed) return

    try {
      await deleteProvider(provider.id)
      toast.success(t('llmProviders.providerDeleted'))
      await fetchProviders()
    } catch {
      toast.error(t('llmProviders.deleteError'))
    }
  }

  /**
   * Get the translated label for a filter tab.
   * @param filter - The filter key
   * @returns Translated label string
   */
  const getFilterLabel = (filter: string): string => {
    if (filter === 'all') return t('llmProviders.allTypes')
    return MODEL_TYPE_LABELS[filter] ?? filter
  }

  // -- Render ----------------------------------------------------------------

  return (
    <div className="h-full flex flex-col p-6 gap-6">
      {/* Inject "Add Provider" button into the layout header */}
      <HeaderActions>
        <Button onClick={handleAdd} size="sm">
          <Plus size={16} className="mr-1" />
          {t('llmProviders.addProvider')}
        </Button>
      </HeaderActions>

      {/* -- Section 1: System Default Models -------------------------------- */}
      <DefaultModelsPanel
        providers={providers}
        onDefaultChanged={fetchProviders}
      />

      {/* -- Section 2: All Providers table ---------------------------------- */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Type filter tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {TYPE_FILTERS.map((filter) => (
            <Button
              key={filter}
              variant={typeFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setTypeFilter(filter); setPage(1) }}
            >
              {getFilterLabel(filter)}
            </Button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto border rounded-md dark:border-gray-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('llmProviders.factoryName')}</TableHead>
                <TableHead>{t('llmProviders.modelType')}</TableHead>
                <TableHead>{t('llmProviders.modelName')}</TableHead>
                <TableHead>{t('llmProviders.vision')}</TableHead>
                <TableHead>{t('llmProviders.apiBase')}</TableHead>
                <TableHead>{t('llmProviders.maxTokens')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : pageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                pageData.map((p) => (
                  <TableRow key={p.id}>
                    {/* Factory name badge */}
                    <TableCell>
                      <Badge variant="outline" className="font-medium">
                        {p.factory_name}
                      </Badge>
                    </TableCell>
                    {/* Color-coded model type badge */}
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${MODEL_TYPE_BADGE_CLASSES[p.model_type] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                        {MODEL_TYPE_LABELS[p.model_type] ?? p.model_type}
                      </span>
                    </TableCell>
                    {/* Model name */}
                    <TableCell>{p.model_name}</TableCell>
                    {/* Vision indicator — only shown for chat providers with an image2text sibling */}
                    <TableCell>
                      {p.model_type === 'chat' && hasVisionSibling(p, providers) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Eye size={16} className="text-purple-500 fill-purple-200 dark:fill-purple-800" />
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('llmProviders.supportsVision')}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    {/* API base URL */}
                    <TableCell className="max-w-[200px] truncate text-gray-500 dark:text-gray-400">
                      {p.api_base || '\u2014'}
                    </TableCell>
                    {/* Max tokens */}
                    <TableCell>{p.max_tokens ?? '\u2014'}</TableCell>
                    {/* Action buttons */}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(p)}>
                          <Pencil size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p)}>
                          <Trash2 size={14} className="text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('common.totalItems', { total: filtered.length })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                {t('common.previous')}
              </Button>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {safePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                {t('common.next')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* -- Create / Edit dialog -------------------------------------------- */}
      <ProviderFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        provider={editingProvider}
        presets={presets}
        allProviders={providers}
      />
    </div>
  )
}

export default LLMProviderPage
