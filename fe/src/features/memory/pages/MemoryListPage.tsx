/**
 * @fileoverview Memory pool list page with card grid, create/edit/delete dialogs.
 *
 * Features:
 * - Card grid listing all memory pools in responsive 3/2/1 column layout
 * - Create dialog with name, description, memory type checkboxes, storage type,
 *   extraction mode, permission, and scope type fields
 * - Edit dialog reuses create form with pre-filled values
 * - Delete confirmation dialog with pool name
 * - Empty state when no pools exist
 * - Loading skeleton during fetch
 * - Dark/light theme support
 * - Full i18n support (en, vi, ja)
 *
 * @module features/memory/pages/MemoryListPage
 */

import { useState } from 'react'
import { useNavigateWithLoader } from '@/components/NavigationLoader'
import { useTranslation } from 'react-i18next'
import { Plus, Brain } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { globalMessage } from '@/app/App'

import { useMemories, useCreateMemory, useUpdateMemory, useDeleteMemory } from '../api/memoryQueries'
import { MemoryCard } from '../components/MemoryCard'
import { MemoryType, hasMemoryType } from '../types/memory.types'
import type {
  Memory,
  MemoryStorageType,
  MemoryExtractionMode,
  MemoryPermission,
  MemoryScopeType,
  CreateMemoryDto,
} from '../types/memory.types'

// ============================================================================
// Form State Type
// ============================================================================

/**
 * @description Internal form state for create/edit memory pool dialogs
 */
interface MemoryFormState {
  name: string
  description: string
  memory_type: number
  storage_type: MemoryStorageType
  extraction_mode: MemoryExtractionMode
  permission: MemoryPermission
  scope_type: MemoryScopeType
}

/**
 * @description Default form state for new memory pool creation
 */
const DEFAULT_FORM: MemoryFormState = {
  name: '',
  description: '',
  memory_type: 15, // All types enabled by default (1+2+4+8)
  storage_type: 'table',
  extraction_mode: 'batch',
  permission: 'me',
  scope_type: 'user',
}

// ============================================================================
// Skeleton Loading Grid
// ============================================================================

/**
 * @description Skeleton loading state for the memory card grid
 * @returns {JSX.Element} Grid of animated skeleton cards
 */
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-36 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse"
        />
      ))}
    </div>
  )
}

// ============================================================================
// Memory Type Checkbox Group
// ============================================================================

/**
 * @description Memory type entries for the checkbox group in create/edit dialogs
 */
const MEMORY_TYPE_OPTIONS = [
  { value: MemoryType.RAW, labelKey: 'memory.raw' },
  { value: MemoryType.SEMANTIC, labelKey: 'memory.semantic' },
  { value: MemoryType.EPISODIC, labelKey: 'memory.episodic' },
  { value: MemoryType.PROCEDURAL, labelKey: 'memory.procedural' },
] as const

// ============================================================================
// Component
// ============================================================================

/**
 * @description Main memory pool list page with card grid, create/edit/delete dialogs,
 * empty state, and loading skeleton. Uses useMemories hook for data fetching.
 * @returns {JSX.Element} Rendered memory list page
 */
export default function MemoryListPage() {
  const { t } = useTranslation()
  const navigate = useNavigateWithLoader()

  // Data fetching
  const { data: memories, isLoading } = useMemories()
  const createMemory = useCreateMemory()
  const updateMemory = useUpdateMemory()
  const deleteMemory = useDeleteMemory()

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [deletingMemory, setDeletingMemory] = useState<Memory | null>(null)

  // Form state for create/edit
  const [form, setForm] = useState<MemoryFormState>(DEFAULT_FORM)

  // --------------------------------------------------------------------------
  // Form helpers
  // --------------------------------------------------------------------------

  /**
   * @description Reset form to defaults and open create dialog
   */
  const openCreateDialog = () => {
    setForm(DEFAULT_FORM)
    setIsCreateOpen(true)
  }

  /**
   * @description Pre-fill form with existing memory data and open edit dialog
   * @param {Memory} memory - Memory pool to edit
   */
  const openEditDialog = (memory: Memory) => {
    setForm({
      name: memory.name,
      description: memory.description ?? '',
      memory_type: memory.memory_type,
      storage_type: memory.storage_type,
      extraction_mode: memory.extraction_mode,
      permission: memory.permission,
      scope_type: memory.scope_type,
    })
    setEditingMemory(memory)
  }

  /**
   * @description Toggle a specific memory type bit in the bitmask
   * @param {number} typeValue - Bitmask value to toggle (1, 2, 4, or 8)
   */
  const toggleMemoryType = (typeValue: number) => {
    setForm((prev) => ({
      ...prev,
      // XOR toggle: flip the bit for the specified type
      memory_type: prev.memory_type ^ typeValue,
    }))
  }

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  /**
   * @description Handle create memory pool form submission
   */
  const handleCreate = async () => {
    if (!form.name.trim()) return
    try {
      // Use spread pattern for optional description to satisfy exactOptionalPropertyTypes
      const desc = form.description.trim()
      const payload: CreateMemoryDto = {
        name: form.name.trim(),
        memory_type: form.memory_type,
        storage_type: form.storage_type,
        extraction_mode: form.extraction_mode,
        permission: form.permission,
        scope_type: form.scope_type,
        ...(desc ? { description: desc } : {}),
      }
      await createMemory.mutateAsync(payload)
      setIsCreateOpen(false)
      setForm(DEFAULT_FORM)
      globalMessage.success(t('memory.created'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Handle edit memory pool form submission
   */
  const handleEdit = async () => {
    if (!editingMemory || !form.name.trim()) return
    try {
      const desc = form.description.trim()
      await updateMemory.mutateAsync({
        id: editingMemory.id,
        data: {
          name: form.name.trim(),
          memory_type: form.memory_type,
          storage_type: form.storage_type,
          extraction_mode: form.extraction_mode,
          permission: form.permission,
          scope_type: form.scope_type,
          ...(desc ? { description: desc } : {}),
        },
      })
      setEditingMemory(null)
      setForm(DEFAULT_FORM)
      globalMessage.success(t('memory.updated'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  /**
   * @description Handle delete memory pool confirmation
   */
  const handleDelete = async () => {
    if (!deletingMemory) return
    try {
      await deleteMemory.mutateAsync(deletingMemory.id)
      setDeletingMemory(null)
      globalMessage.success(t('memory.deleted'))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(msg)
    }
  }

  // --------------------------------------------------------------------------
  // Empty state
  // --------------------------------------------------------------------------

  /**
   * @description Empty state component shown when no memory pools exist
   * @returns {JSX.Element} Empty state with create CTA
   */
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Brain size={48} className="text-slate-300 dark:text-slate-600 mb-4" />
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
        {t('memory.empty')}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
        {t('memory.emptyHint')}
      </p>
      <Button onClick={openCreateDialog}>
        <Plus size={16} className="mr-1" />
        {t('memory.create')}
      </Button>
    </div>
  )

  // --------------------------------------------------------------------------
  // Shared form fields (reused in create and edit dialogs)
  // --------------------------------------------------------------------------

  /**
   * @description Renders the memory pool form fields (name, description, types, etc.)
   * @returns {JSX.Element} Form field elements
   */
  const FormFields = () => (
    <div className="space-y-4 py-2">
      {/* Name field (required) */}
      <div className="space-y-2">
        <Label>{t('memory.name')}</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          placeholder={t('memory.name')}
          className="dark:bg-slate-800 dark:border-slate-700"
        />
      </div>

      {/* Description field */}
      <div className="space-y-2">
        <Label>{t('memory.description')}</Label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          rows={2}
          className="dark:bg-slate-800 dark:border-slate-700"
        />
      </div>

      {/* Memory type checkboxes */}
      <div className="space-y-2">
        <Label>{t('memory.memoryType')}</Label>
        <div className="flex flex-wrap gap-3">
          {MEMORY_TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hasMemoryType(form.memory_type, option.value)}
                onChange={() => toggleMemoryType(option.value)}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-slate-700 dark:text-slate-300">{t(option.labelKey)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Storage type radio */}
      <div className="space-y-2">
        <Label>{t('memory.storageType')}</Label>
        <div className="flex gap-4">
          {(['table', 'graph'] as const).map((val) => (
            <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="storage_type"
                checked={form.storage_type === val}
                onChange={() => setForm((prev) => ({ ...prev, storage_type: val }))}
              />
              <span className="text-slate-700 dark:text-slate-300">{t(`memory.${val}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Extraction mode radio */}
      <div className="space-y-2">
        <Label>{t('memory.extractionMode')}</Label>
        <div className="flex gap-4">
          {(['batch', 'realtime'] as const).map((val) => (
            <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="extraction_mode"
                checked={form.extraction_mode === val}
                onChange={() => setForm((prev) => ({ ...prev, extraction_mode: val }))}
              />
              <span className="text-slate-700 dark:text-slate-300">{t(`memory.${val}`)}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Permission radio */}
      <div className="space-y-2">
        <Label>{t('memory.permission')}</Label>
        <div className="flex gap-4">
          {(['me', 'team'] as const).map((val) => (
            <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="permission"
                checked={form.permission === val}
                onChange={() => setForm((prev) => ({ ...prev, permission: val }))}
              />
              <span className="text-slate-700 dark:text-slate-300">
                {val === 'me' ? t('memory.permMe') : t('memory.permTeam')}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Scope type select */}
      <div className="space-y-2">
        <Label>{t('memory.scopeType')}</Label>
        <Select
          value={form.scope_type}
          onValueChange={(value: string) => setForm((prev) => ({ ...prev, scope_type: value as MemoryScopeType }))}
        >
          <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">{t('memory.scopeUser')}</SelectItem>
            <SelectItem value="agent">{t('memory.scopeAgent')}</SelectItem>
            <SelectItem value="team">{t('memory.scopeTeam')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t('memory.title')}
        </h1>
        <Button onClick={openCreateDialog}>
          <Plus size={16} className="mr-1" />
          {t('memory.create')}
        </Button>
      </div>

      {/* Card grid or empty/loading state */}
      {isLoading ? (
        <SkeletonGrid />
      ) : !memories || memories.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {memories.map((memory) => (
            <div
              key={memory.id}
              className="cursor-pointer"
              onClick={() => navigate(`/memory/${memory.id}`)}
            >
              <MemoryCard
                memory={memory}
                onEdit={openEditDialog}
                onDelete={setDeletingMemory}
              />
            </div>
          ))}
        </div>
      )}

      {/* Create Memory Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="dark:bg-slate-900 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('memory.create')}</DialogTitle>
          </DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.name.trim() || createMemory.isPending}
            >
              {t('memory.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Memory Dialog */}
      <Dialog open={!!editingMemory} onOpenChange={(open: boolean) => { if (!open) setEditingMemory(null) }}>
        <DialogContent className="dark:bg-slate-900 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('memory.edit')}</DialogTitle>
          </DialogHeader>
          <FormFields />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMemory(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleEdit}
              disabled={!form.name.trim() || updateMemory.isPending}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingMemory} onOpenChange={(open: boolean) => { if (!open) setDeletingMemory(null) }}>
        <DialogContent className="dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>{t('memory.delete')}</DialogTitle>
            <DialogDescription>
              {t('memory.deleteConfirm', { name: deletingMemory?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingMemory(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMemory.isPending}
            >
              {t('memory.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
