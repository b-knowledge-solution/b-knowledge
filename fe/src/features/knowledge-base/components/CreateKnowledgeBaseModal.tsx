/**
 * @fileoverview Single-step create knowledge base modal.
 *
 * Knowledge bases are type-agnostic containers. Categories and versions
 * are managed on the knowledge base detail page, not during creation.
 *
 * Form fields: name (required), description, visibility toggle.
 *
 * Uses native useState instead of form libraries.
 *
 * @module features/knowledge-base/components/CreateKnowledgeBaseModal
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

import type { createKnowledgeBase } from '../api/knowledgeBaseApi'

// ============================================================================
// Types
// ============================================================================

interface CreateKnowledgeBaseModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Whether the form is saving */
  saving: boolean
  /** Submit handler with project creation payload */
  onSubmit: (data: Parameters<typeof createKnowledgeBase>[0]) => void
  /** Cancel handler */
  onCancel: () => void
}

/** Form data shape — name, description, and visibility only */
interface KnowledgeBaseFormData {
  name: string
  description: string
  isPrivate: boolean
}

const INITIAL_FORM: KnowledgeBaseFormData = {
  name: '',
  description: '',
  isPrivate: false,
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Single-step modal for creating a new project.
 * Knowledge bases are type-agnostic containers — categories and versions
 * are created on the knowledge base detail page after knowledge base creation.
 *
 * @param {CreateKnowledgeBaseModalProps} props - Component props
 * @returns {JSX.Element} React element
 */
const CreateKnowledgeBaseModal = ({
  open,
  saving,
  onSubmit,
  onCancel,
}: CreateKnowledgeBaseModalProps) => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<KnowledgeBaseFormData>(INITIAL_FORM)
  const [nameError, setNameError] = useState('')

  /**
   * @description Update a form field value.
   * @param {K} field - Field name
   * @param {KnowledgeBaseFormData[K]} value - New value
   */
  const updateField = <K extends keyof KnowledgeBaseFormData>(field: K, value: KnowledgeBaseFormData[K]) => {
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

    // Build payload — no first_version_label since versions are managed on detail page
    onSubmit({
      name: formData.name,
      ...(formData.description ? { description: formData.description } : {}),
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
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t('projectManagement.createProject')}</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {/* Knowledge base name (required) */}
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

export default CreateKnowledgeBaseModal
