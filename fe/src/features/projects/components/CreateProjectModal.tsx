/**
 * @fileoverview Multi-step create project modal.
 *
 * Step 1: Category selection (office, datasync, source_code disabled)
 * Step 2: Project details + auto-dataset name preview
 * Step 3 (datasync only): Sync source configuration
 *
 * Uses native useState instead of Ant Design Form.
 *
 * @module features/projects/components/CreateProjectModal
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Steps,
  Input,
  Select as AntSelect,
  Card,
  Tag,
  Divider,
} from 'antd'

import {
  FileText,
  RefreshCw,
  Code,
} from 'lucide-react'
import type { ProjectCategory, SyncSourceType } from '../api/projectService'
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
 * Multi-step modal for creating a new project.
 *
 * @param props - Component props
 * @returns React element
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
   * Update a form field.
   * @param field - Field name
   * @param value - New value
   */
  const updateField = <K extends keyof ProjectFormData>(field: K, value: ProjectFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Handle the next step or final submit.
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
   * Handle going back a step.
   */
  const handlePrev = () => {
    if (step > 0) setStep(step - 1)
  }

  /**
   * Reset state when modal closes.
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
    <Modal
      title={t('projectManagement.createProject')}
      open={open}
      onOk={handleNext}
      onCancel={handleCancel}
      confirmLoading={saving}
      okText={step < totalSteps - 1 ? t('common.next') : t('common.save')}
      cancelText={step > 0 ? t('common.previous') : t('common.cancel')}
      onClose={handleCancel}
      width={640}
      destroyOnHidden
      footer={(_: unknown, { OkBtn, CancelBtn }: { OkBtn: React.ComponentType; CancelBtn: React.ComponentType }) => (
        <div className="flex justify-between">
          <div>
            {step > 0 && (
              <button
                type="button"
                className="ant-btn ant-btn-default"
                onClick={handlePrev}
              >
                {t('common.previous')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <CancelBtn />
            <OkBtn />
          </div>
        </div>
      )}
    >
      {/* Step indicator */}
      <Steps
        current={step}
        size="small"
        className="mb-6"
        items={[
          { title: t('projectManagement.steps.category') },
          { title: t('projectManagement.steps.details') },
          ...(category === 'datasync'
            ? [{ title: t('projectManagement.steps.syncConfig') }]
            : []),
        ]}
      />

      {/* Step 1: Category selection */}
      {step === 0 && (
        <div className="grid grid-cols-3 gap-4">
          {CATEGORY_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const isSelected = category === opt.value
            return (
              // @ts-expect-error antd v6 Card type mismatch with React 19
              <Card
                key={opt.value}
                hoverable={!opt.disabled}
                onClick={() => !opt.disabled && setCategory(opt.value)}
                className={`text-center cursor-pointer transition-all ${
                  isSelected
                    ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800'
                    : ''
                } ${opt.disabled ? 'opacity-50 cursor-not-allowed' : ''} dark:bg-slate-800 dark:border-slate-700`}
              >
                <Icon
                  size={32}
                  className={`mx-auto mb-2 ${
                    isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'
                  }`}
                />
                <p className="font-medium text-slate-900 dark:text-white">
                  {t(`projectManagement.categories.${opt.value}`)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t(`projectManagement.categoryDesc.${opt.value}`)}
                </p>
                {opt.disabled && (
                  <Tag className="mt-2">{t('common.comingSoon', 'Coming Soon')}</Tag>
                )}
              </Card>
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                updateField('name', e.target.value)
                if (nameError) setNameError('')
              }}
              status={nameError ? 'error' : undefined}
            />
            {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              {t('projectManagement.descriptionLabel')}
            </label>
            <Input.TextArea
              rows={2}
              placeholder={t('projectManagement.descriptionPlaceholder')}
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('description', e.target.value)}
            />
          </div>

          {/* Auto-dataset name preview */}
          <Divider className="my-2" />
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-medium">{t('projectManagement.autoDataset')}:</span>{' '}
            <code className="bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-xs">
              {datasetPreview || '—'}
            </code>
          </div>
        </div>
      )}

      {/* Step 3: Sync config (datasync only) */}
      {step === 2 && category === 'datasync' && (
        <div className="mt-2">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('projectManagement.sync.sourceType')}
            </label>
            <AntSelect
              value={syncSourceType}
              onChange={(v: SyncSourceType) => {
                setSyncSourceType(v)
                setConnectionConfig({})
              }}
              className="w-full"
              options={[
                { value: 'sharepoint', label: 'SharePoint' },
                { value: 'jira', label: 'JIRA' },
                { value: 'confluence', label: 'Confluence' },
                { value: 'gitlab', label: 'GitLab' },
                { value: 'github', label: 'GitHub' },
              ]}
            />
          </div>
          <SyncConnectionFields
            sourceType={syncSourceType}
            config={connectionConfig}
            onChange={setConnectionConfig}
          />
        </div>
      )}
    </Modal>
  )
}

export default CreateProjectModal
