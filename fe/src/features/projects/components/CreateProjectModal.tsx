/**
 * @fileoverview Multi-step create project modal.
 *
 * Step 1: Category selection (office, datasync, source_code disabled)
 * Step 2: Project details + auto-dataset name preview
 * Step 3 (datasync only): Sync source configuration
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
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'

import {
  FileText,
  RefreshCw,
  Code,
} from 'lucide-react'
import type { ProjectCategory, SyncSourceType } from '../api/projectApi'
import SyncConnectionFields from './SyncConnectionFields'

// ============================================================================
// Types
// ============================================================================

interface CreateProjectModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Whether the form is saving */
  saving: boolean
  /** Submit handler */
  onSubmit: (data: {
    name: string
    description?: string
    category: ProjectCategory
    sync_config?: {
      source_type: SyncSourceType
      connection_config: Record<string, unknown>
      sync_schedule?: string
    }
  }) => void
  /** Cancel handler */
  onCancel: () => void
}

/** Form data shape for step 2 */
interface ProjectFormData {
  name: string
  description: string
}

const INITIAL_FORM: ProjectFormData = {
  name: '',
  description: '',
}

// ============================================================================
// Category card config
// ============================================================================

const CATEGORY_OPTIONS: {
  value: ProjectCategory
  icon: typeof FileText
  disabled: boolean
}[] = [
  { value: 'office', icon: FileText, disabled: false },
  { value: 'datasync', icon: RefreshCw, disabled: false },
  { value: 'source_code', icon: Code, disabled: true },
]

// ============================================================================
// Component
// ============================================================================

/**
 * @description Multi-step modal for creating a new project.
 *
 * @param props - Component props
 * @returns {JSX.Element} React element
 */
const CreateProjectModal = ({
  open,
  saving,
  onSubmit,
  onCancel,
}: CreateProjectModalProps) => {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [category, setCategory] = useState<ProjectCategory>('office')
  const [formData, setFormData] = useState<ProjectFormData>(INITIAL_FORM)
  const [nameError, setNameError] = useState('')
  const [syncSourceType, setSyncSourceType] = useState<SyncSourceType>('sharepoint')
  const [connectionConfig, setConnectionConfig] = useState<Record<string, unknown>>({})

  /** Total steps: 2 for office, 3 for datasync */
  const totalSteps = category === 'datasync' ? 3 : 2

  /** Auto-generated dataset name preview */
  const datasetPreview = formData.name
    ? `${formData.name}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
    : ''

  /**
   * @description Update a form field.
   * @param field - Field name
   * @param value - New value
   */
  const updateField = <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * @description Handle the next step or final submit.
   */
  const handleNext = () => {
    if (step === 0) {
      // Category selected, move to details
      setStep(1)
      return
    }

    if (step === 1) {
      // Validate name
      if (!formData.name.trim()) {
        setNameError(`${t('projectManagement.name')} is required`)
        return
      }
      setNameError('')

      if (category === 'datasync') {
        // Move to sync config step
        setStep(2)
        return
      }

      // Final submit for office/source_code
      onSubmit({
        name: formData.name,
        ...(formData.description ? { description: formData.description } : {}),
        category,
      })
      return
    }

    // Step 2 (datasync): submit with sync config
    onSubmit({
      name: formData.name,
      ...(formData.description ? { description: formData.description } : {}),
      category,
      sync_config: {
        source_type: syncSourceType,
        connection_config: connectionConfig,
      },
    })
  }

  /**
   * @description Handle going back a step.
   */
  const handlePrev = () => {
    if (step > 0) setStep(step - 1)
  }

  /**
   * @description Reset state when modal closes.
   */
  const handleCancel = () => {
    setStep(0)
    setCategory('office')
    setSyncSourceType('sharepoint')
    setConnectionConfig({})
    setFormData(INITIAL_FORM)
    setNameError('')
    onCancel()
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) handleCancel() }}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t('projectManagement.createProject')}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[
            t('projectManagement.steps.category'),
            t('projectManagement.steps.details'),
            ...(category === 'datasync'
              ? [t('projectManagement.steps.syncConfig')]
              : []),
          ].map((title, idx) => (
            <div key={idx} className="flex items-center gap-2">
              {idx > 0 && <div className="w-8 h-px bg-border" />}
              <div className="flex items-center gap-1.5">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  idx <= step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {idx + 1}
                </div>
                <span className={`text-sm ${idx <= step ? 'font-medium' : 'text-muted-foreground'}`}>
                  {title}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Category selection */}
        {step === 0 && (
          <div className="grid grid-cols-3 gap-4">
            {CATEGORY_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isSelected = category === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => !opt.disabled && setCategory(opt.value)}
                  className={`text-center cursor-pointer transition-all rounded-lg border p-4 ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 dark:ring-primary/40'
                      : 'border-border hover:border-primary/50'
                  } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : ''} bg-card dark:bg-card`}
                >
                  <Icon
                    size={32}
                    className={`mx-auto mb-2 ${
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  />
                  <p className="font-medium text-foreground">
                    {t(`projectManagement.categories.${opt.value}`)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(`projectManagement.categoryDesc.${opt.value}`)}
                  </p>
                  {opt.disabled && (
                    <Badge variant="secondary" className="mt-2">{t('common.comingSoon', 'Coming Soon')}</Badge>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Step 2: Project details */}
        {step === 1 && (
          <div className="mt-2 space-y-4">
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

            {/* Auto-dataset name preview */}
            <Separator className="my-2" />
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{t('projectManagement.autoDataset')}:</span>{' '}
              <code className="bg-muted px-2 py-0.5 rounded text-xs">
                {datasetPreview || '—'}
              </code>
            </div>
          </div>
        )}

        {/* Step 3: Sync config (datasync only) */}
        {step === 2 && category === 'datasync' && (
          <div className="mt-2">
            <div className="mb-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('projectManagement.sync.sourceType')}
              </label>
              <Select
                value={syncSourceType}
                onValueChange={(v: string) => {
                  setSyncSourceType(v as SyncSourceType)
                  setConnectionConfig({})
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sharepoint">SharePoint</SelectItem>
                  <SelectItem value="jira">JIRA</SelectItem>
                  <SelectItem value="confluence">Confluence</SelectItem>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="github">GitHub</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SyncConnectionFields
              sourceType={syncSourceType}
              config={connectionConfig}
              onChange={setConnectionConfig}
            />
          </div>
        )}

        <DialogFooter>
          <div className="flex w-full justify-between">
            <div>
              {step > 0 && (
                <Button variant="outline" onClick={handlePrev}>
                  {t('common.previous')}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleNext} disabled={saving}>
                {saving
                  ? t('common.saving')
                  : step < totalSteps - 1
                    ? t('common.next')
                    : t('common.save')
                }
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CreateProjectModal
