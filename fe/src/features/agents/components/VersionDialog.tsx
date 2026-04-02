/**
 * @fileoverview Version management dialog for agents.
 * Allows saving, listing, restoring, and deleting agent version snapshots.
 *
 * @module features/agents/components/VersionDialog
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Trash2, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAgentVersions,
  useSaveVersion,
  useRestoreVersion,
  useDeleteVersion,
} from '../api/agentQueries'
import type { Agent } from '../types/agent.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the VersionDialog component
 */
interface VersionDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Agent UUID for which versions are managed */
  agentId: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Dialog for managing agent version snapshots. Provides save, restore,
 *   and delete actions on version history with confirmation dialogs for destructive ops.
 * @param {VersionDialogProps} props - Dialog configuration
 * @returns {JSX.Element} Rendered version management dialog
 */
export function VersionDialog({ open, onClose, agentId }: VersionDialogProps) {
  const { t } = useTranslation()
  const [versionLabel, setVersionLabel] = useState('')
  const [confirmAction, setConfirmAction] = useState<{
    type: 'restore' | 'delete'
    versionId: string
    label: string
  } | null>(null)

  // Data hooks for version operations
  const { data: versions, isLoading } = useAgentVersions(agentId)
  const saveVersion = useSaveVersion()
  const restoreVersion = useRestoreVersion()
  const deleteVersion = useDeleteVersion()

  /**
   * Save the current agent state as a new version snapshot
   */
  const handleSave = () => {
    // Use spread pattern for optional data to satisfy exactOptionalPropertyTypes
    const payload: { id: string; data?: { version_label?: string } } = { id: agentId }
    if (versionLabel) {
      payload.data = { version_label: versionLabel }
    }
    saveVersion.mutate(
      payload,
      {
        onSuccess: () => {
          toast.success(t('agents.versionSaved', 'Version saved'))
          setVersionLabel('')
        },
      },
    )
  }

  /**
   * Restore the agent to a previously saved version after confirmation
   */
  const handleRestore = () => {
    if (!confirmAction || confirmAction.type !== 'restore') return
    restoreVersion.mutate(
      { id: agentId, versionId: confirmAction.versionId },
      {
        onSuccess: () => {
          toast.success(t('agents.versionRestored', 'Version restored'))
          setConfirmAction(null)
        },
      },
    )
  }

  /**
   * Delete a specific version snapshot after confirmation
   */
  const handleDelete = () => {
    if (!confirmAction || confirmAction.type !== 'delete') return
    deleteVersion.mutate(
      { id: agentId, versionId: confirmAction.versionId },
      {
        onSuccess: () => {
          toast.success(t('agents.versionDeleted', 'Version deleted'))
          setConfirmAction(null)
        },
      },
    )
  }

  // Type-safe cast for version list (versions are Agent rows with version_number > 0)
  const versionList = (versions ?? []) as Agent[]

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('agents.versions', 'Versions')}
          </DialogTitle>
        </DialogHeader>

        {/* Save new version section */}
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Input
            placeholder={t('agents.versionLabelPlaceholder', 'Version label (optional)')}
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveVersion.isPending}
          >
            <Save className="h-4 w-4 mr-1" />
            {t('agents.saveVersion', 'Save Version')}
          </Button>
        </div>

        {/* Version list */}
        <ScrollArea className="flex-1 overflow-auto pr-2">
          {isLoading ? (
            // Skeleton loading state
            <div className="space-y-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          ) : versionList.length === 0 ? (
            // Empty state
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('agents.noVersionsYet', 'No versions saved yet')}
            </div>
          ) : (
            // Version entries
            <div className="space-y-2 py-2">
              {versionList.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/50 dark:hover:bg-muted/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {/* Show version label if set, otherwise generic version number */}
                      {version.version_label || `v${version.version_number}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(version.created_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Per-version actions */}
                  <div className="flex items-center gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t('agents.restoreVersion', 'Restore')}
                      onClick={() => setConfirmAction({
                        type: 'restore',
                        versionId: version.id,
                        label: version.version_label || `v${version.version_number}`,
                      })}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      title={t('common.delete', 'Delete')}
                      onClick={() => setConfirmAction({
                        type: 'delete',
                        versionId: version.id,
                        label: version.version_label || `v${version.version_number}`,
                      })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Confirmation sub-dialog for restore/delete */}
        {confirmAction && (
          <div className="border-t border-border pt-3 mt-2">
            <p className="text-sm text-muted-foreground mb-3">
              {confirmAction.type === 'delete'
                ? t(
                    'agents.deleteVersionConfirm',
                    'This will permanently delete version {{label}}. The current published version is not affected.',
                    { label: confirmAction.label },
                  )
                : t(
                    'agents.restoreVersionConfirm',
                    'This will restore the agent to version {{label}}. Current unsaved changes will be lost.',
                    { label: confirmAction.label },
                  )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction(null)}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                variant={confirmAction.type === 'delete' ? 'destructive' : 'default'}
                size="sm"
                onClick={confirmAction.type === 'delete' ? handleDelete : handleRestore}
                disabled={restoreVersion.isPending || deleteVersion.isPending}
              >
                {confirmAction.type === 'delete'
                  ? t('common.delete', 'Delete')
                  : t('agents.restoreVersion', 'Restore')}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
