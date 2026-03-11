/**
 * @fileoverview Modal dialog for creating or editing a document version.
 * Uses shadcn/ui Dialog component with controlled form inputs.
 *
 * @module features/datasets/components/VersionModal
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { DocumentVersion } from '../types'

// ============================================================================
// Types
// ============================================================================

interface VersionModalProps {
  /** @description Whether the modal is visible */
  open: boolean
  /** @description Version to edit, or null for create mode */
  editingVersion: DocumentVersion | null
  /** @description Whether the submit action is in progress */
  saving: boolean
  /** @description Callback when the user confirms */
  onSubmit: (data: { version_label: string }) => void
  /** @description Callback when the user cancels or closes */
  onCancel: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal dialog for creating or editing a document version.
 *
 * @param {VersionModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const VersionModal = ({ open, editingVersion, saving, onSubmit, onCancel }: VersionModalProps) => {
  const { t } = useTranslation()
  const [versionLabel, setVersionLabel] = useState('')

  // Pre-fill form when editing
  useEffect(() => {
    if (open && editingVersion) {
      setVersionLabel(editingVersion.version_label)
    } else if (open) {
      setVersionLabel('')
    }
  }, [open, editingVersion])

  /** Handle form submission */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!versionLabel.trim()) return
    onSubmit({ version_label: versionLabel.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {editingVersion ? t('versions.editTitle') : t('versions.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Version label input */}
          <div className="space-y-2">
            <Label htmlFor="version-label">{t('versions.label')}</Label>
            <Input
              id="version-label"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder={t('versions.labelPlaceholder')}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !versionLabel.trim()}>
              {saving ? t('common.saving') : editingVersion ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default VersionModal
