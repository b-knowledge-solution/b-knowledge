/**
 * @fileoverview Single-step create project modal (D-01 refactor).
 *
 * Projects are now type-agnostic containers. The category picker
 * (office/datasync/source_code) has been removed since categories
 * are now per-category with their own category_type field.
 *
 * Form fields: name (required), description, visibility toggle,
 * first version label, parser defaults.
 *
 * Uses native useState instead of form libraries.
 *
 * @module features/projects/components/CreateProjectModal
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

import type { createProject } from '../api/projectApi'

// ============================================================================
// Types
// ============================================================================

interface CreateProjectModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Whether the form is saving */
  saving: boolean
  /** Submit handler with project creation payload (no category field) */
  onSubmit: (data: Parameters<typeof createProject>[0]) => void
  /** Cancel handler */
  onCancel: () => void
}

/** Form data shape */
interface ProjectFormData {
  name: string
  description: string
  firstVersionLabel: string
  isPrivate: boolean
}

const INITIAL_FORM: ProjectFormData = {
  name: '',
  description: '',
  firstVersionLabel: 'v1',
  isPrivate: false,
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Single-step modal for creating a new project.
 * Projects are type-agnostic containers; no category selection step.
 *
 * @param {CreateProjectModalProps} props - Component props
 * @returns {JSX.Element} React element
 */
const CreateProjectModal = ({
  open,
  saving,
  onSubmit,
  onCancel,
}: CreateProjectModalProps) => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<ProjectFormData>(INITIAL_FORM)
  const [nameError, setNameError] = useState('')

  /** Auto-generated dataset name preview */
  const datasetPreview = formData.name && formData.firstVersionLabel
    ? `${formData.name}_${formData.firstVersionLabel}`
    : ''

  /**
   * @description Update a form field value.
   * @param {K} field - Field name
   * @param {ProjectFormData[K]} value - New value
   */
  const updateField = <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * @description Handle form submission with validation.
   */
  const handleSubmit = () => {
    // Validate required name field
    if (!formData.name.trim()) {
      setNameError(`${t('projectManagement.name')} is required`)
      return
    }
    setNameError('')

    // Build payload without category field
    onSubmit({
      name: formData.name,
      ...(formData.description ? { description: formData.description } : {}),
      ...(formData.firstVersionLabel ? { first_version_label: formData.firstVersionLabel } : {}),
      is_private: formData.isPrivate,
    })
  }

  /**
   * @description Reset form state and close modal.
   */
  const handleCancel = () => {
    setFormData(INITIAL_FORM)
    setNameError('')
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) handleCancel() }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('projectManagement.createProject')}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {/* Project name (required) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('projectManagement.name')} <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder={t('projectManagement.namePlaceholder')}
              value={formData.name}
              onChange={(e) => {
                updateField('name', e.target.value)
                if (nameError) setNameError('')
              }}
              className={nameError ? 'border-destructive' : ''}
            />
            {nameError && <p className="text-destructive text-xs mt-1">{nameError}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('projectManagement.descriptionLabel')}
            </label>
            <Textarea
              rows={2}
              placeholder={t('projectManagement.descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
            />
          </div>

          {/* First version label */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('projectManagement.firstVersionLabel')}
            </label>
            <Input
              placeholder={t('projectManagement.firstVersionPlaceholder', 'e.g. v1')}
              value={formData.firstVersionLabel}
              onChange={(e) => updateField('firstVersionLabel', e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t('projectManagement.firstVersionHint')}
            </p>
          </div>

          <Separator className="my-2" />

          {/* Visibility toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="private-toggle" className="text-sm font-medium">
                {t('projectManagement.privateProject', 'Private project')}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('projectManagement.privateProjectHint', 'Only members can access this project')}
              </p>
            </div>
            <Switch
              id="private-toggle"
              checked={formData.isPrivate}
              onCheckedChange={(checked: boolean) => updateField('isPrivate', checked)}
            />
          </div>

          {/* Auto-dataset name preview */}
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{t('projectManagement.autoDataset')}:</span>{' '}
            <code className="bg-muted px-2 py-0.5 rounded text-xs">
              {datasetPreview || '\u2014'}
            </code>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? t('common.saving') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CreateProjectModal
