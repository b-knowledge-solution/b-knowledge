/**
 * @fileoverview Dialog for uploading a new version of an existing dataset.
 * Provides file drop zone, change summary input, and auto-parse toggle.
 *
 * @module features/datasets/components/UploadNewVersionDialog
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import VersionUploadArea from './VersionUploadArea'
import { useCreateDatasetVersion } from '../api/datasetQueries'

/**
 * @description Props for the UploadNewVersionDialog component.
 */
interface UploadNewVersionDialogProps {
  /** Parent dataset UUID */
  datasetId: string
  /** Dataset name shown in the dialog title */
  datasetName: string
  /** Whether the dialog is open */
  open: boolean
  /** Callback to control dialog open/close state */
  onOpenChange: (open: boolean) => void
}

/**
 * @description Dialog for uploading a new version of an existing dataset.
 * Contains a file drop zone (reusing VersionUploadArea), a change summary input,
 * and an auto-parse toggle. Submits via useCreateDatasetVersion mutation.
 *
 * @param {UploadNewVersionDialogProps} props - Component props
 * @returns {JSX.Element} Rendered upload version dialog
 */
const UploadNewVersionDialog = ({
  datasetId,
  datasetName,
  open,
  onOpenChange,
}: UploadNewVersionDialogProps) => {
  const { t } = useTranslation()
  const [files, setFiles] = useState<File[]>([])
  const [versionLabel, setVersionLabel] = useState('')
  const [changeSummary, setChangeSummary] = useState('')
  const [autoParse, setAutoParse] = useState(true)

  const createVersion = useCreateDatasetVersion(datasetId)

  /** Reset form state when dialog closes */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setFiles([])
      setVersionLabel('')
      setChangeSummary('')
      setAutoParse(true)
    }
    onOpenChange(nextOpen)
  }

  /** Handle file selection from the upload area */
  const handleFilesSelected = (selected: File[]) => {
    setFiles(selected)
  }

  /** Submit the version upload */
  const handleSubmit = async () => {
    // Require at least one file
    if (files.length === 0) return

    try {
      // Build mutation payload, omitting optional fields when empty to satisfy exactOptionalPropertyTypes
      const payload: { files: File[]; changeSummary?: string; versionLabel?: string; autoParse?: boolean } = { files, autoParse }
      const trimmedLabel = versionLabel.trim()
      if (trimmedLabel) payload.versionLabel = trimmedLabel
      const trimmed = changeSummary.trim()
      if (trimmed) payload.changeSummary = trimmed
      await createVersion.mutateAsync(payload)
      // Close dialog on success
      handleOpenChange(false)
    } catch (err) {
      // Show error toast for failed uploads
      const message = err instanceof Error ? err.message : t('datasets.uploadNewVersionFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('datasets.uploadNewVersion')}</DialogTitle>
          <DialogDescription>
            {t('datasets.uploadNewVersionDesc', { name: datasetName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* File drop zone */}
          <VersionUploadArea
            uploading={createVersion.isPending}
            onUpload={handleFilesSelected}
          />

          {/* Version label input (optional custom display name like '1.2.0') */}
          <div className="space-y-2">
            <Label htmlFor="version-label">{t('datasets.versionLabel')}</Label>
            <Input
              id="version-label"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder={t('datasets.versionLabelPlaceholder')}
              maxLength={128}
              disabled={createVersion.isPending}
            />
          </div>

          {/* Change summary input */}
          <div className="space-y-2">
            <Label htmlFor="change-summary">{t('datasets.changeSummary')}</Label>
            <Input
              id="change-summary"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder={t('datasets.changeSummaryPlaceholder')}
              disabled={createVersion.isPending}
            />
          </div>

          {/* Auto-parse toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-parse">{t('datasets.autoParse')}</Label>
            <Switch
              id="auto-parse"
              checked={autoParse}
              onCheckedChange={setAutoParse}
              disabled={createVersion.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={createVersion.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={files.length === 0 || createVersion.isPending}
          >
            {createVersion.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('datasets.uploadNewVersion')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default UploadNewVersionDialog
