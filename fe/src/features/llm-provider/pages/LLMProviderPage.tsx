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
import { Plus, Pencil, Trash2, Eye, Plug, Loader2, Copy } from 'lucide-react'
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
  testConnection,
} from '../api/llmProviderApi'
import { MODEL_TYPES } from '../types/llmProvider.types'
import type { ModelProvider, CreateProviderDTO, UpdateProviderDTO } from '../types/llmProvider.types'
import { ModelType } from '@/constants'

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

  // Provider to clone from — used to pre-populate Create dialog with source config
  const [cloningFrom, setCloningFrom] = useState<ModelProvider | null>(null)

  // Track which providers are currently being tested for connection
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())

  // -- Derived data ----------------------------------------------------------

  // Apply model_type filter (include image2text companions when filtering chat)
  const filtered = typeFilter === 'all'
    ? providers
    : typeFilter === ModelType.CHAT
      ? providers.filter((p) => p.model_type === ModelType.CHAT || p.model_type === ModelType.IMAGE2TEXT)
      : providers.filter((p) => p.model_type === typeFilter)

  // Group providers by factory_name + model_name for display
  // Same-name + same-factory shows as one row with multiple type badges
  const grouped = (() => {
    const map = new Map<string, { primary: ModelProvider; types: ModelProvider[] }>()
    for (const p of filtered) {
      const key = `${p.factory_name}::${p.model_name}`
      if (!map.has(key)) {
        map.set(key, { primary: p, types: [p] })
      } else {
        const group = map.get(key)!
        group.types.push(p)
        // Prefer chat as primary (for edit/delete actions)
        if (p.model_type === ModelType.CHAT) {
          group.primary = p
        }
      }
    }
    return Array.from(map.values())
  })()

  // Total pages for pagination
  const totalPages = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE))

  // Clamp current page
  const safePage = Math.min(page, totalPages)

  // Slice grouped rows for current page
  const pageData = grouped.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // -- Handlers --------------------------------------------------------------

  /** Open dialog in create mode */
  const handleAdd = () => {
    setEditingProvider(null)
    setDialogOpen(true)
  }

  /** Open dialog in edit mode */
  const handleEdit = (provider: ModelProvider) => {
    setEditingProvider(provider)
    setCloningFrom(null)
    setDialogOpen(true)
  }

  /**
   * Open dialog in create mode, pre-populated with settings from the source provider.
   * API key is intentionally left blank — user can enter a new one or skip.
   * @param provider - The source provider to clone settings from
   */
  const handleClone = (provider: ModelProvider) => {
    setEditingProvider(null)
    setCloningFrom(provider)
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
   * Test the connection to a provider and show toast result.
   * @param provider - Provider to test
   */
  const handleTestConnection = async (provider: ModelProvider) => {
    // Add provider to testing set
    setTestingIds((prev) => new Set(prev).add(provider.id))

    try {
      const result = await testConnection(provider.id)
      if (result.success) {
        toast.success(t('llmProviders.connectionSuccess', { latency: result.latencyMs ?? 0 }))
      } else {
        toast.error(t('llmProviders.connectionFailed', { error: result.error ?? 'Unknown error' }))
      }
    } catch {
      toast.error(t('llmProviders.connectionFailed', { error: 'Network error' }))
    } finally {
      // Remove provider from testing set
      setTestingIds((prev) => {
        const next = new Set(prev)
        next.delete(provider.id)
        return next
      })
    }
  }

  /**
   * Get the translated label for a filter tab.
   * @param filter - The filter key
   * @returns Translated label string
   */
  const getFilterLabel = (filter: string): string => {
    if (filter === 'all') return t('llmProviders.allTypes')
    return t(`llmProviders.modelTypes.${filter}`)
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
                <TableHead>{t('llmProviders.apiBase')}</TableHead>
                <TableHead>{t('llmProviders.maxTokens')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : pageData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                    {t('common.noData')}
                  </TableCell>
                </TableRow>
              ) : (
              pageData.map((row) => (
                  <TableRow key={row.primary.id}>
                    {/* Factory name badge */}
                    <TableCell>
                      <Badge variant="outline" className="font-medium">
                        {row.primary.factory_name}
                      </Badge>
                    </TableCell>
                    {/* Color-coded model type badges — shows all types for grouped row */}
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        {row.types.map((p) => (
                          <span key={p.model_type} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${MODEL_TYPE_BADGE_CLASSES[p.model_type] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'}`}>
                            {p.model_type === ModelType.IMAGE2TEXT && <Eye size={10} className="mr-0.5" />}
                            {t(`llmProviders.modelTypes.${p.model_type}`)}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    {/* Model name */}
                    <TableCell>{row.primary.model_name}</TableCell>
                    {/* API base URL */}
                    <TableCell className="max-w-[200px] truncate text-gray-500 dark:text-gray-400">
                      {row.primary.api_base || '\u2014'}
                    </TableCell>
                    {/* Max tokens */}
                    <TableCell>{row.primary.max_tokens ?? '\u2014'}</TableCell>
                    {/* Action buttons */}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTestConnection(row.primary)}
                          disabled={testingIds.has(row.primary.id)}
                          title={t('llmProviders.testConnection')}
                        >
                          {testingIds.has(row.primary.id)
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Plug size={14} />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleClone(row.primary)}
                          title={t('llmProviders.cloneProvider')}
                        >
                          <Copy size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(row.primary)}
                          title={t('llmProviders.editProvider')}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(row.primary)}
                          title={t('common.delete')}
                        >
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
              {t('common.totalItems', { total: grouped.length })}
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

      {/* -- Create / Edit / Clone dialog ----------------------------------- */}
      <ProviderFormDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setCloningFrom(null) }}
        onSubmit={handleSubmit}
        provider={editingProvider}
        cloningFrom={cloningFrom}
        presets={presets}
      />
    </div>
  )
}

export default LLMProviderPage
