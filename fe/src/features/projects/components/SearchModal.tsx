/**
 * @fileoverview Modal form for creating/updating an AI Search app with full RAGFlow config.
 *
 * Uses native useState instead of Ant Design Form.
 *
 * @module features/projects/components/SearchModal
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Modal,
  Input,
  Checkbox,
  Collapse,
  Slider,
  InputNumber,
  Switch,
  Typography,
  Select,
  Divider,
} from 'antd'
import type {
  DocumentCategory,
  DocumentCategoryVersion,
  ProjectSearch,
} from '../api/projectApi'

const { TextArea } = Input
const { Text } = Typography

// ============================================================================
// Constants
// ============================================================================

/** Creativity presets matching RAGFlow's native UI */
const CREATIVITY_PRESETS: Record<string, {
  temperature: number
  top_p: number
  presence_penalty: number
  frequency_penalty: number
}> = {
  improvise: { temperature: 0.8, top_p: 0.9, presence_penalty: 0.1, frequency_penalty: 0.1 },
  precise:   { temperature: 0.2, top_p: 0.75, presence_penalty: 0.5, frequency_penalty: 0.5 },
  balance:   { temperature: 0.5, top_p: 0.85, presence_penalty: 0.2, frequency_penalty: 0.3 },
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Custom slider + input control that shows the value on the right.
 */
const SliderInput = ({
  value = 0,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  value?: number
  onChange?: (val: number) => void
  min?: number
  max?: number
  step?: number
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <Slider
      style={{ flex: 1 }}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
    />
    <InputNumber
      style={{ width: 72 }}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(v: number | null) => onChange?.(v ?? min)}
      size="small"
    />
  </div>
)

/**
 * Custom control for Vector Similarity Weight that shows dual labels
 * (vector X.XX / full-text X.XX) above the slider.
 */
const VectorWeightControl = ({
  value = 0.7,
  onChange,
}: {
  value?: number
  onChange?: (val: number) => void
}) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <Text type="secondary" style={{ fontSize: 12 }}>vector {value.toFixed(2)}</Text>
      <Text type="secondary" style={{ fontSize: 12 }}>full-text {(1 - value).toFixed(2)}</Text>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Slider
        style={{ flex: 1 }}
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={onChange}
      />
      <InputNumber
        style={{ width: 72 }}
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(v: number | null) => onChange?.(v ?? 0.7)}
        size="small"
      />
    </div>
  </div>
)

// ============================================================================
// Types
// ============================================================================

/** Search config shape */
interface SearchConfig {
  similarity_threshold: number
  vector_similarity_weight: number
  rerank_enabled: boolean
  rerank_model: string
  ai_summary: boolean
  model: string
  temperature: number
  top_p: number
  presence_penalty: number
  frequency_penalty: number
}

/** Full form data shape */
export interface SearchFormData {
  name: string
  description: string
  dataset_ids: string[]
  search_config: SearchConfig
}

/** Default search config */
const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  similarity_threshold: 0.2,
  vector_similarity_weight: 0.7,
  rerank_enabled: false,
  rerank_model: '',
  ai_summary: false,
  model: '',
  temperature: 0.5,
  top_p: 0.85,
  presence_penalty: 0.2,
  frequency_penalty: 0.3,
}

const INITIAL_FORM: SearchFormData = {
  name: '',
  description: '',
  dataset_ids: [],
  search_config: { ...DEFAULT_SEARCH_CONFIG },
}

interface SearchModalProps {
  /** Whether the modal is visible */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** Success callback after save */
  onSuccess: () => void
  /** Whether in edit mode */
  isEditing: boolean
  /** Search being edited (null for create) */
  editingSearch: ProjectSearch | null
  /** Project document categories */
  categories: DocumentCategory[]
  /** Map of category ID -> its versions */
  categoryVersions: Record<string, DocumentCategoryVersion[]>
  /** Available chat models from the RAGFlow server */
  chatModels: string[]
  /** Save handler -- called with form values */
  onSave: (values: SearchFormData) => Promise<void>
  /** Loading state for save */
  saving: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal form for creating/editing an AI Search app.
 */
const SearchModal = ({
  open,
  onClose,
  isEditing,
  editingSearch,
  categories,
  categoryVersions,
  chatModels,
  onSave,
  saving,
}: SearchModalProps) => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<SearchFormData>(INITIAL_FORM)
  const [nameError, setNameError] = useState('')

  // Populate form when modal opens
  useEffect(() => {
    if (open && isEditing && editingSearch) {
      setFormData({
        name: editingSearch.name,
        description: editingSearch.description || '',
        dataset_ids: editingSearch.dataset_ids || [],
        search_config: {
          similarity_threshold: editingSearch.search_config?.similarity_threshold ?? 0.2,
          vector_similarity_weight: editingSearch.search_config?.vector_similarity_weight ?? 0.7,
          rerank_enabled: editingSearch.search_config?.rerank_enabled ?? false,
          rerank_model: editingSearch.search_config?.rerank_model || '',
          ai_summary: editingSearch.search_config?.ai_summary ?? false,
          model: editingSearch.search_config?.model || '',
          temperature: editingSearch.search_config?.temperature ?? 0.5,
          top_p: editingSearch.search_config?.top_p ?? 0.85,
          presence_penalty: editingSearch.search_config?.presence_penalty ?? 0.2,
          frequency_penalty: editingSearch.search_config?.frequency_penalty ?? 0.3,
        },
      })
    } else if (open && !isEditing) {
      setFormData(INITIAL_FORM)
    }
    setNameError('')
  }, [open, isEditing, editingSearch])

  /**
   * Category checkbox options: one per category with a label showing version count.
   */
  const categoryOptions = categories.map((cat) => {
    const versions = categoryVersions[cat.id] || []
    const activeVersions = versions.filter((v) => v.ragflow_dataset_id)
    return {
      label: `${cat.name} (${activeVersions.length} dataset${activeVersions.length !== 1 ? 's' : ''})`,
      value: cat.id,
    }
  })

  /**
   * Update a top-level field.
   * @param field - Field name
   * @param value - New value
   */
  const updateField = <K extends keyof SearchFormData>(field: K, value: SearchFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Update a search_config field.
   * @param field - Config field name
   * @param value - New value
   */
  const updateConfig = <K extends keyof SearchConfig>(field: K, value: SearchConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      search_config: { ...prev.search_config, [field]: value },
    }))
  }

  /**
   * Handle creativity preset change.
   * @param preset - Preset name
   */
  const handleCreativityChange = (preset: string) => {
    if (preset === 'custom') return
    const values = CREATIVITY_PRESETS[preset]
    if (values) {
      setFormData((prev) => ({
        ...prev,
        search_config: { ...prev.search_config, ...values },
      }))
    }
  }

  /**
   * Validate and submit.
   */
  const handleOk = () => {
    if (!formData.name.trim()) {
      setNameError(t('projectManagement.searches.nameRequired', 'Name is required'))
      return
    }
    setNameError('')
    onSave(formData)
  }

  return (
    <Modal
      title={isEditing
        ? t('projectManagement.searches.editSearch', 'Edit Search')
        : t('projectManagement.searches.createSearch', 'Create Search')
      }
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      width={720}
      destroyOnClose
    >
      <div className="space-y-4">
        {/* Section 1: Basic Info */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.searches.name', 'Name')} <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder={t('projectManagement.searches.namePlaceholder', 'Enter search app name')}
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
            {t('projectManagement.searches.description', 'Description')}
          </label>
          <TextArea
            rows={2}
            placeholder={t('projectManagement.searches.descriptionPlaceholder', 'Enter description')}
            value={formData.description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('description', e.target.value)}
          />
        </div>

        <Divider />

        {/* Section 2: Datasets */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.searches.datasets', 'Datasets')}
          </label>
          <Checkbox.Group
            options={categoryOptions}
            value={formData.dataset_ids}
            onChange={(vals: string[]) => updateField('dataset_ids', vals)}
          />
        </div>

        <Divider />

        {/* Section 3: Retrieval Config */}
        <Collapse
          ghost
          defaultActiveKey={['retrieval']}
          items={[
            {
              key: 'retrieval',
              label: t('projectManagement.searches.retrievalConfig', 'Retrieval Configuration'),
              children: (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {t('projectManagement.searches.similarityThreshold', 'Similarity Threshold')}
                    </label>
                    <SliderInput
                      min={0}
                      max={1}
                      step={0.01}
                      value={formData.search_config.similarity_threshold}
                      onChange={(v) => updateConfig('similarity_threshold', v)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {t('projectManagement.searches.vectorWeight', 'Vector Similarity Weight')}
                    </label>
                    <VectorWeightControl
                      value={formData.search_config.vector_similarity_weight}
                      onChange={(v) => updateConfig('vector_similarity_weight', v)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {t('projectManagement.searches.rerankModel', 'Rerank Model')}
                    </label>
                    <Switch
                      checked={formData.search_config.rerank_enabled}
                      onChange={(v: boolean) => updateConfig('rerank_enabled', v)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {t('projectManagement.searches.aiSummary', 'AI Summary')}
                    </label>
                    <Switch
                      checked={formData.search_config.ai_summary}
                      onChange={(v: boolean) => updateConfig('ai_summary', v)}
                    />
                  </div>
                </div>
              ),
            },
          ]}
        />

        {/* Section 4: LLM Config (shown when AI Summary is on) */}
        {formData.search_config.ai_summary && (
          <Collapse
            ghost
            defaultActiveKey={['llm']}
            items={[
              {
                key: 'llm',
                label: t('projectManagement.searches.llmConfig', 'LLM Configuration'),
                children: (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('projectManagement.searches.model', 'Model')}
                      </label>
                      {chatModels.length > 0 ? (
                        <Select
                          placeholder={t('projectManagement.searches.selectModel', 'Select model')}
                          options={chatModels.map((m) => ({ label: m, value: m }))}
                          allowClear
                          value={formData.search_config.model || undefined}
                          onChange={(v: string) => updateConfig('model', v || '')}
                          className="w-full"
                        />
                      ) : (
                        <Input
                          placeholder={t('projectManagement.searches.modelPlaceholder', 'Enter model name')}
                          value={formData.search_config.model}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateConfig('model', e.target.value)}
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('projectManagement.searches.creativity', 'Creativity')}
                      </label>
                      <Select
                        defaultValue="custom"
                        onChange={handleCreativityChange}
                        options={[
                          { label: t('projectManagement.searches.improvise', 'Improvise'), value: 'improvise' },
                          { label: t('projectManagement.searches.precise', 'Precise'), value: 'precise' },
                          { label: t('projectManagement.searches.balance', 'Balance'), value: 'balance' },
                          { label: t('projectManagement.searches.custom', 'Custom'), value: 'custom' },
                        ]}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('projectManagement.searches.temperature', 'Temperature')}
                      </label>
                      <SliderInput
                        min={0} max={1} step={0.01}
                        value={formData.search_config.temperature}
                        onChange={(v) => updateConfig('temperature', v)}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('projectManagement.searches.topP', 'Top P')}
                      </label>
                      <SliderInput
                        min={0} max={1} step={0.01}
                        value={formData.search_config.top_p}
                        onChange={(v) => updateConfig('top_p', v)}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('projectManagement.searches.presencePenalty', 'Presence Penalty')}
                      </label>
                      <SliderInput
                        min={0} max={1} step={0.01}
                        value={formData.search_config.presence_penalty}
                        onChange={(v) => updateConfig('presence_penalty', v)}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {t('projectManagement.searches.frequencyPenalty', 'Frequency Penalty')}
                      </label>
                      <SliderInput
                        min={0} max={1} step={0.01}
                        value={formData.search_config.frequency_penalty}
                        onChange={(v) => updateConfig('frequency_penalty', v)}
                      />
                    </div>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </Modal>
  )
}

export default SearchModal
