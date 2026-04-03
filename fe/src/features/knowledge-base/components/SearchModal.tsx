/**
 * @fileoverview Modal form for creating/updating an AI Search app with full RAGFlow config.
 *
 * Uses native useState instead of form libraries.
 *
 * @module features/knowledge-base/components/SearchModal
 */

import { useState, useEffect } from 'react'
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
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ChevronDown } from 'lucide-react'
import type {
  DocumentCategory,
  DocumentCategoryVersion,
  KnowledgeBaseSearch,
} from '../api/knowledgeBaseApi'

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
 * @description Custom slider + input control that shows the value on the right.
 * @param props - min, max, step, value, onChange
 * @returns {JSX.Element} Rendered slider input
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
  <div className="flex items-center gap-3">
    <input
      type="range"
      min={min} max={max} step={step}
      value={value}
      onChange={(e) => onChange?.(Number(e.target.value))}
      className="flex-1 h-2 accent-primary"
    />
    <Input
      type="number"
      min={min} max={max} step={step}
      value={value}
      onChange={(e) => onChange?.(Number(e.target.value))}
      className="w-[72px]"
    />
  </div>
)

/**
 * @description Custom control for Vector Similarity Weight that shows dual labels
 * (vector X.XX / full-text X.XX) above the slider.
 * @param {{ value?: number, onChange?: (val: number) => void }} props
 * @returns {JSX.Element} Rendered weight control
 */
const VectorWeightControl = ({
  value = 0.7,
  onChange,
}: {
  value?: number
  onChange?: (val: number) => void
}) => {
  const { t } = useTranslation()

  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-muted-foreground">{t('knowledgeBase.common.vector')} {value.toFixed(2)}</span>
        <span className="text-xs text-muted-foreground">{t('knowledgeBase.common.fullText')} {(1 - value).toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0} max={1} step={0.01}
          value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="flex-1 h-2 accent-primary"
        />
        <Input
          type="number"
          min={0} max={1} step={0.01}
          value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="w-[72px]"
        />
      </div>
    </div>
  )
}

/**
 * @description Simple collapsible section with a toggle header.
 * @param {{ title: string, defaultOpen?: boolean, children: React.ReactNode }} props
 * @returns {JSX.Element} Rendered collapsible section
 */
const CollapsibleSection = ({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left py-2 text-sm font-semibold"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        {title}
      </button>
      {isOpen && <div className="pl-6 pt-2">{children}</div>}
    </div>
  )
}

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
  editingSearch: KnowledgeBaseSearch | null
  /** Knowledge base document categories */
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
 * @description Modal form for creating/editing an AI Search app.
 * @param {SearchModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
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
   * @description Category checkbox options: one per category with a label showing version count.
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
   * @description Update a top-level field.
   * @param field - Field name
   * @param value - New value
   */
  const updateField = <K extends keyof SearchFormData>(field: K, value: SearchFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * @description Update a search_config field.
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
   * @description Handle creativity preset change.
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
   * @description Validate and submit.
   */
  const handleOk = () => {
    if (!formData.name.trim()) {
      setNameError(t('knowledgeBase.searches.nameRequired', 'Name is required'))
      return
    }
    setNameError('')
    onSave(formData)
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t('knowledgeBase.searches.editSearch', 'Edit Search')
              : t('knowledgeBase.searches.createSearch', 'Create Search')
            }
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section 1: Basic Info */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('knowledgeBase.searches.name', 'Name')} <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder={t('knowledgeBase.searches.namePlaceholder', 'Enter search app name')}
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
              {t('knowledgeBase.searches.description', 'Description')}
            </label>
            <Textarea
              rows={2}
              placeholder={t('knowledgeBase.searches.descriptionPlaceholder', 'Enter description')}
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
            />
          </div>

          <Separator />

          {/* Section 2: Datasets */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('knowledgeBase.searches.datasets', 'Datasets')}
            </label>
            <div className="flex flex-col gap-2">
              {categoryOptions.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`search-cat-${opt.value}`}
                    checked={formData.dataset_ids.includes(opt.value)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        updateField('dataset_ids', [...formData.dataset_ids, opt.value])
                      } else {
                        updateField('dataset_ids', formData.dataset_ids.filter((id) => id !== opt.value))
                      }
                    }}
                  />
                  <Label htmlFor={`search-cat-${opt.value}`} className="text-sm">{opt.label}</Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Section 3: Retrieval Config */}
          <CollapsibleSection title={t('knowledgeBase.searches.retrievalConfig', 'Retrieval Configuration')} defaultOpen>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('knowledgeBase.searches.similarityThreshold', 'Similarity Threshold')}
                </label>
                <SliderInput
                  min={0} max={1} step={0.01}
                  value={formData.search_config.similarity_threshold}
                  onChange={(v) => updateConfig('similarity_threshold', v)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('knowledgeBase.searches.vectorWeight', 'Vector Similarity Weight')}
                </label>
                <VectorWeightControl
                  value={formData.search_config.vector_similarity_weight}
                  onChange={(v) => updateConfig('vector_similarity_weight', v)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="rerank-enabled"
                  checked={formData.search_config.rerank_enabled}
                  onCheckedChange={(v: boolean) => updateConfig('rerank_enabled', v)}
                />
                <Label htmlFor="rerank-enabled" className="text-sm">
                  {t('knowledgeBase.searches.rerankModel', 'Rerank Model')}
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="ai-summary"
                  checked={formData.search_config.ai_summary}
                  onCheckedChange={(v: boolean) => updateConfig('ai_summary', v)}
                />
                <Label htmlFor="ai-summary" className="text-sm">
                  {t('knowledgeBase.searches.aiSummary', 'AI Summary')}
                </Label>
              </div>
            </div>
          </CollapsibleSection>

          {/* Section 4: LLM Config (shown when AI Summary is on) */}
          {formData.search_config.ai_summary && (
            <CollapsibleSection title={t('knowledgeBase.searches.llmConfig', 'LLM Configuration')} defaultOpen>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('knowledgeBase.searches.model', 'Model')}
                  </label>
                  {chatModels.length > 0 ? (
                    <Select
                      value={formData.search_config.model || undefined}
                      onValueChange={(v: string) => updateConfig('model', v || '')}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('knowledgeBase.searches.selectModel', 'Select model')} />
                      </SelectTrigger>
                      <SelectContent>
                        {chatModels.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder={t('knowledgeBase.searches.modelPlaceholder', 'Enter model name')}
                      value={formData.search_config.model}
                      onChange={(e) => updateConfig('model', e.target.value)}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('knowledgeBase.searches.creativity', 'Creativity')}
                  </label>
                  <Select defaultValue="custom" onValueChange={handleCreativityChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="improvise">{t('knowledgeBase.searches.improvise', 'Improvise')}</SelectItem>
                      <SelectItem value="precise">{t('knowledgeBase.searches.precise', 'Precise')}</SelectItem>
                      <SelectItem value="balance">{t('knowledgeBase.searches.balance', 'Balance')}</SelectItem>
                      <SelectItem value="custom">{t('knowledgeBase.searches.custom', 'Custom')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('knowledgeBase.searches.temperature', 'Temperature')}
                  </label>
                  <SliderInput
                    min={0} max={1} step={0.01}
                    value={formData.search_config.temperature}
                    onChange={(v) => updateConfig('temperature', v)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('knowledgeBase.searches.topP', 'Top P')}
                  </label>
                  <SliderInput
                    min={0} max={1} step={0.01}
                    value={formData.search_config.top_p}
                    onChange={(v) => updateConfig('top_p', v)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('knowledgeBase.searches.presencePenalty', 'Presence Penalty')}
                  </label>
                  <SliderInput
                    min={0} max={1} step={0.01}
                    value={formData.search_config.presence_penalty}
                    onChange={(v) => updateConfig('presence_penalty', v)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('knowledgeBase.searches.frequencyPenalty', 'Frequency Penalty')}
                  </label>
                  <SliderInput
                    min={0} max={1} step={0.01}
                    value={formData.search_config.frequency_penalty}
                    onChange={(v) => updateConfig('frequency_penalty', v)}
                  />
                </div>
              </div>
            </CollapsibleSection>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleOk} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SearchModal
