/**
 * @fileoverview Dialog for managing dataset access control (RBAC).
 * Provides a public toggle and tabbed interface for assigning team/user access.
 * @module features/datasets/components/DatasetAccessDialog
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { datasetApi } from '../api/datasetApi'
import { globalMessage } from '@/app/App'
import { PolicyRuleEditor } from './PolicyRuleEditor'
import type { Dataset, AbacPolicyRule } from '../types'

// ============================================================================
// Props
// ============================================================================

interface DatasetAccessDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** The dataset to manage access for */
  dataset: Dataset | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal dialog for managing dataset access control.
 * Shows a public/private toggle, and when private, displays tabbed
 * searchable checkbox lists for teams and users.
 *
 * @param {DatasetAccessDialogProps} props - Component properties
 * @returns {JSX.Element} The rendered access management dialog
 */
export default function DatasetAccessDialog({
  open,
  onClose,
  dataset,
}: DatasetAccessDialogProps) {
  const { t } = useTranslation()

  // Whether the dataset is publicly accessible
  const [isPublic, setIsPublic] = useState(true)

  // Loading and saving state
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /**
   * @description Fetch current access settings for this dataset.
   */
  const loadData = async () => {
    if (!dataset) return
    setLoading(true)
    try {
      // Fetch current access control for this dataset
      const access = await datasetApi.getDatasetAccess(dataset.id)
      // Set local state from the response
      setIsPublic(access.public)
    } catch (error) {
      console.error('[DatasetAccessDialog] Failed to load access data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Load data when dialog opens
  useEffect(() => {
    if (open && dataset) {
      loadData()
    }
  }, [open, dataset])

  /**
   * @description Save the updated public/private toggle to the API.
   */
  const handleSave = async () => {
    if (!dataset) return
    setSaving(true)
    try {
      await datasetApi.setDatasetAccess(dataset.id, {
        public: isPublic,
      })
      globalMessage.success(t('datasetAccess.saveSuccess'))
      onClose()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('common.error')
      globalMessage.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open && !!dataset} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('datasetAccess.title')} - {dataset?.name}
          </DialogTitle>
        </DialogHeader>

        {/* Loading spinner while fetching data */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size={32} />
          </div>
        ) : (
          <>
            {/* Public/Private Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600">
              <div className="flex items-center gap-3">
                {isPublic ? (
                  <Globe className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Lock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                )}
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {t('datasetAccess.isPublic')}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('datasetAccess.publicDesc')}
                  </p>
                </div>
              </div>
              <Switch
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>

            {/* ABAC Policy Rule Editor — shown only when not public */}
            {!isPublic && dataset && (
              <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                <PolicyRuleEditor
                  datasetId={dataset.id}
                  initialRules={(dataset as Dataset & { policy_rules?: AbacPolicyRule[] }).policy_rules ?? []}
                  onSave={() => {
                    // Close dialog after successful policy save
                    onClose()
                  }}
                />
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
