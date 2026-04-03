/**
 * @fileoverview Knowledge base dataset picker for binding/unbinding datasets.
 * Shows bound datasets in a table and provides a multi-select dialog for binding new ones.
 * @module features/knowledge-base/components/KnowledgeBaseDatasetPicker
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, Link2, Unlink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { globalMessage } from '@/app/App'
import { useConfirm } from '@/components/ConfirmDialog'
import { useDatasets } from '@/features/datasets'

import { useKnowledgeBaseBoundDatasets, useBindDatasets, useUnbindDataset } from '../api/knowledgeBaseQueries'

// ============================================================================
// Types
// ============================================================================

interface KnowledgeBaseDatasetPickerProps {
  /** Knowledge Base UUID to manage dataset bindings for */
  knowledgeBaseId: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Multi-select dataset binding manager with bound dataset table and bind dialog.
 * Shows currently bound datasets with unbind action, and a dialog for selecting new datasets to bind.
 * @param {KnowledgeBaseDatasetPickerProps} props - Component props
 * @returns {JSX.Element} Rendered dataset picker with bind/unbind functionality
 */
export default function KnowledgeBaseDatasetPicker({ knowledgeBaseId }: KnowledgeBaseDatasetPickerProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  // Data hooks
  const { data: boundDatasets = [], isLoading } = useKnowledgeBaseBoundDatasets(knowledgeBaseId)
  const bindDatasets = useBindDatasets(knowledgeBaseId)
  const unbindDataset = useUnbindDataset(knowledgeBaseId)

  // Fetch all org datasets for the bind dialog
  const { datasets: allDatasets, loading: datasetsLoading } = useDatasets()

  // Bind dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  /**
   * Open the bind dialog with no pre-selected datasets.
   */
  const handleOpenBind = () => {
    setSelectedIds([])
    setDialogOpen(true)
  }

  /**
   * Toggle a dataset in the selection list.
   */
  const toggleDataset = (datasetId: string) => {
    setSelectedIds((prev) =>
      prev.includes(datasetId) ? prev.filter((id) => id !== datasetId) : [...prev, datasetId],
    )
  }

  /**
   * Submit the selected datasets for binding.
   */
  const handleBind = async () => {
    if (selectedIds.length === 0) return
    try {
      await bindDatasets.mutateAsync(selectedIds)
      globalMessage.success(t('common.saveSuccess'))
      setDialogOpen(false)
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  /**
   * Unbind a dataset after confirmation.
   */
  const handleUnbind = async (datasetId: string) => {
    const confirmed = await confirm({
      title: t('knowledgeBase.unbindConfirmTitle'),
      message: t('knowledgeBase.unbindConfirm'),
      variant: 'danger',
      confirmText: t('common.delete'),
    })
    if (!confirmed) return

    try {
      await unbindDataset.mutateAsync(datasetId)
      globalMessage.success(t('common.deleteSuccess'))
    } catch (err) {
      globalMessage.error(String(err))
    }
  }

  // Filter available datasets: exclude already-bound ones
  const boundDatasetIds = new Set(boundDatasets.map((d) => d.dataset_id))
  const availableDatasets = allDatasets.filter((d) => !boundDatasetIds.has(d.id))

  // ── Loading ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with bind button */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {t('knowledgeBase.tabs.datasets')}
        </h3>
        <Button size="sm" onClick={handleOpenBind}>
          <Link2 size={16} className="mr-2" />
          {t('knowledgeBase.bindDatasets')}
        </Button>
      </div>

      {/* Bound datasets table or empty state */}
      {boundDatasets.length === 0 ? (
        <EmptyState
          icon={<Database className="h-12 w-12 mx-auto" strokeWidth={1} />}
          title={t('knowledgeBase.datasets.empty')}
          description={t('knowledgeBase.datasets.emptyDescription')}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('knowledgeBase.docCount')}</TableHead>
                <TableHead className="w-[80px]">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boundDatasets.map((ds) => (
                <TableRow key={ds.id}>
                  <TableCell className="font-medium">
                    {ds.dataset_name || ds.dataset_id}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ds.dataset_doc_count ?? 0}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleUnbind(ds.dataset_id)}
                    >
                      <Unlink size={16} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bind Datasets Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('knowledgeBase.bindDatasets')}</DialogTitle>
          </DialogHeader>

          {/* Checkbox list of available datasets */}
          <div className="max-h-[350px] overflow-y-auto space-y-1">
            {datasetsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size={20} />
              </div>
            ) : availableDatasets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('common.noData')}
              </p>
            ) : (
              availableDatasets.map((ds) => (
                <label
                  key={ds.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.includes(ds.id)}
                    onCheckedChange={() => toggleDataset(ds.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ds.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ds.doc_count ?? 0} {t('knowledgeBase.datasetCount')}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleBind}
              disabled={selectedIds.length === 0 || bindDatasets.isPending}
            >
              {bindDatasets.isPending && <Spinner size={16} className="mr-2" />}
              {t('knowledgeBase.bindDatasets')} ({selectedIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
