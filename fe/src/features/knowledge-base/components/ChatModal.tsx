/**
 * @fileoverview Modal form for creating/updating a chat assistant with full RAGFlow config.
 *
 * Uses native useState instead of form libraries.
 *
 * @module features/knowledge-base/components/ChatModal
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import type {
  DocumentCategory,
  DocumentCategoryVersion,
  KnowledgeBaseChat,
} from '../api/knowledgeBaseApi'

// ============================================================================
// Constants
// ============================================================================

/** Default system prompt matching RAGFlow's chat.py default */
const DEFAULT_SYSTEM_PROMPT = `You are an intelligent assistant. Your primary function is to answer questions based strictly on the provided knowledge base.

**Essential Rules:**
  - Your answer must be derived **solely** from this dataset: \`{knowledge}\`.
  - **When information is available**: Summarize the content to give a detailed answer.
  - **When information is unavailable**: Your response must contain this exact sentence: "The answer you are looking for is not found in the dataset!"
  - **Always consider** the entire conversation history.`

/** Default opener matching RAGFlow's default prologue */
const DEFAULT_OPENER = "Hi! I'm your assistant. What can I do for you?"

/** Default empty response */
const DEFAULT_EMPTY_RESPONSE = 'Sorry! No relevant content was found in the knowledge base!'

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

/** Available cross-language options */
const CROSS_LANGUAGE_OPTIONS = [
  'English', 'Chinese', 'Japanese', 'Vietnamese', 'Korean', 'French', 'German', 'Spanish',
]

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Custom control for Vector Similarity Weight that shows dual labels.
 * @param {{ value?: number, onChange?: (val: number) => void }} props
 * @returns {JSX.Element} Rendered weight control
 */
const VectorWeightControl = ({
  value = 0.3,
  onChange,
}: {
  value?: number
  onChange?: (val: number) => void
}) => {
  const { t } = useTranslation()
  const vectorVal = (1 - value).toFixed(2)
  const fulltextVal = value.toFixed(2)

  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{t('knowledgeBase.common.vector')} <strong>{vectorVal}</strong></span>
        <span>{t('knowledgeBase.common.fullText')} <strong>{fulltextVal}</strong></span>
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
          className="w-[70px]"
        />
      </div>
    </div>
  )
}

/**
 * @description Reusable Slider + Input combo as a single controlled component.
 * @param props - min, max, step, value, onChange, inputWidth
 * @returns {JSX.Element} Rendered slider input
 */
const SliderInput = ({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  inputWidth = 70,
}: {
  value?: number
  onChange?: (val: number) => void
  min?: number
  max?: number
  step?: number
  inputWidth?: number
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
      style={{ width: inputWidth }}
    />
  </div>
)

/**
 * @description Specialized control for Max Tokens.
 * @param {{ value?: number, onChange?: (val: number) => void }} props
 * @returns {JSX.Element} Rendered max tokens control
 */
const MaxTokensControl = ({
  value = 512,
  onChange,
}: {
  value?: number
  onChange?: (val: number) => void
}) => {
  const SLIDER_MAX = 8192
  const INPUT_MAX = 128000

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={1} max={SLIDER_MAX} step={1}
        value={Math.min(value, SLIDER_MAX)}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className="flex-1 h-2 accent-primary"
      />
      <Input
        type="number"
        min={1} max={INPUT_MAX} step={1}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        className="w-[80px]"
      />
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

/** Prompt config shape */
interface PromptConfig {
  empty_response: string
  opener: string
  show_quote: boolean
  keyword: boolean
  tts: boolean
  refine_multiturn: boolean
  prompt: string
  similarity_threshold: number
  keywords_similarity_weight: number
  top_n: number
  rerank_model: string
  cross_languages: string[]
  variables: { key: string; optional: boolean }[]
}

/** LLM config shape */
interface LlmConfig {
  model_name: string
  temperature: number
  top_p: number
  presence_penalty: number
  frequency_penalty: number
  max_tokens: number
}

/** Full chat form data shape */
export interface ChatFormData {
  name: string
  description: string
  category_ids: string[]
  prompt_config: PromptConfig
  llm_config: LlmConfig
}

const INITIAL_FORM: ChatFormData = {
  name: '',
  description: '',
  category_ids: [],
  prompt_config: {
    empty_response: DEFAULT_EMPTY_RESPONSE,
    opener: DEFAULT_OPENER,
    show_quote: true,
    keyword: false,
    tts: false,
    refine_multiturn: false,
    prompt: DEFAULT_SYSTEM_PROMPT,
    similarity_threshold: 0.2,
    keywords_similarity_weight: 0.7,
    top_n: 6,
    rerank_model: '',
    cross_languages: [],
    variables: [],
  },
  llm_config: {
    model_name: '',
    temperature: 0.1,
    top_p: 0.3,
    presence_penalty: 0.4,
    frequency_penalty: 0.7,
    max_tokens: 512,
  },
}

/**
 * Props for the ChatModal component.
 */
interface ChatModalProps {
  /** Whether the modal is visible */
  open: boolean
  /** Whether the submit action is in progress */
  saving: boolean
  /** Callback when the user confirms with form data */
  onOk: (data: ChatFormData) => void
  /** Callback when the user cancels or closes */
  onCancel: () => void
  /** Knowledge base document categories */
  categories: DocumentCategory[]
  /** Map of category ID -> its versions (pre-fetched) */
  categoryVersions: Record<string, DocumentCategoryVersion[]>
  /** Available chat models from the RAGFlow server config */
  chatModels: string[]
  /** Existing chat data for edit mode (null = create mode) */
  editingChat: KnowledgeBaseChat | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal dialog with a full form for creating/editing a chat assistant.
 *
 * @param {ChatModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const ChatModal = ({
  open,
  saving,
  onOk,
  onCancel,
  categories,
  categoryVersions,
  chatModels,
  editingChat,
}: ChatModalProps) => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<ChatFormData>(INITIAL_FORM)
  const [nameError, setNameError] = useState('')

  /** Determine if we are in edit mode */
  const isEditing = !!editingChat

  // Populate form with existing chat data when editing
  useEffect(() => {
    if (editingChat && open) {
      // Resolve which categories are linked (reverse: version IDs -> category IDs)
      const linkedCategoryIds: string[] = []
      for (const [catId, versions] of Object.entries(categoryVersions)) {
        const hasLinked = versions.some(
          (v) => editingChat.dataset_ids?.includes(v.id)
        )
        if (hasLinked) linkedCategoryIds.push(catId)
      }

      // Cast from Record<string, unknown> to access known fields
      const pc = editingChat.prompt_config as Record<string, any> || {}
      const lc = editingChat.llm_config as Record<string, any> || {}

      setFormData({
        name: editingChat.name,
        description: pc.description || '',
        category_ids: linkedCategoryIds,
        prompt_config: {
          empty_response: pc.empty_response || DEFAULT_EMPTY_RESPONSE,
          opener: pc.opener || DEFAULT_OPENER,
          show_quote: pc.show_quote ?? true,
          keyword: pc.keyword ?? false,
          tts: pc.tts ?? false,
          refine_multiturn: pc.refine_multiturn ?? false,
          prompt: pc.prompt || DEFAULT_SYSTEM_PROMPT,
          similarity_threshold: pc.similarity_threshold ?? 0.2,
          keywords_similarity_weight: pc.keywords_similarity_weight ?? 0.7,
          top_n: pc.top_n ?? 6,
          rerank_model: pc.rerank_model || '',
          cross_languages: pc.cross_languages || [],
          variables: pc.variables || [],
        },
        llm_config: {
          model_name: lc.model_name || '',
          temperature: lc.temperature ?? 0.1,
          top_p: lc.top_p ?? 0.3,
          presence_penalty: lc.presence_penalty ?? 0.4,
          frequency_penalty: lc.frequency_penalty ?? 0.7,
          max_tokens: lc.max_tokens ?? 512,
        },
      })
    } else if (open && !editingChat) {
      setFormData(INITIAL_FORM)
    }
    setNameError('')
  }, [editingChat, open, categoryVersions])

  /**
   * @description Build checkbox options from categories.
   */
  const categoryOptions = categories.map((cat) => {
    const versions = categoryVersions[cat.id] || []
    const activeCount = versions.filter(
      (v) => v.ragflow_dataset_id && v.status === 'active'
    ).length
    return {
      label: `${cat.name} (${activeCount} dataset${activeCount !== 1 ? 's' : ''})`,
      value: cat.id,
      disabled: activeCount === 0,
    }
  })

  /** Check if any category has active datasets */
  const hasAnyDatasets = categoryOptions.some((opt) => !opt.disabled)

  /**
   * @description Update a top-level field.
   */
  const updateField = <K extends keyof ChatFormData>(field: K, value: ChatFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * @description Update a prompt_config field.
   */
  const updatePrompt = <K extends keyof PromptConfig>(field: K, value: PromptConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      prompt_config: { ...prev.prompt_config, [field]: value },
    }))
  }

  /**
   * @description Update an llm_config field.
   */
  const updateLlm = <K extends keyof LlmConfig>(field: K, value: LlmConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      llm_config: { ...prev.llm_config, [field]: value },
    }))
  }

  /**
   * @description Add a new variable entry.
   */
  const addVariable = () => {
    updatePrompt('variables', [...formData.prompt_config.variables, { key: '', optional: false }])
  }

  /**
   * @description Remove a variable by index.
   */
  const removeVariable = (index: number) => {
    updatePrompt('variables', formData.prompt_config.variables.filter((_, i) => i !== index))
  }

  /**
   * @description Update a variable field by index.
   */
  const updateVariable = (index: number, field: 'key' | 'optional', value: string | boolean) => {
    const updated = formData.prompt_config.variables.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    )
    updatePrompt('variables', updated)
  }

  /**
   * @description Toggle a cross-language option on or off.
   */
  const toggleCrossLanguage = (lang: string) => {
    const current = formData.prompt_config.cross_languages
    if (current.includes(lang)) {
      updatePrompt('cross_languages', current.filter((l) => l !== lang))
    } else {
      updatePrompt('cross_languages', [...current, lang])
    }
  }

  /**
   * @description Validate and submit.
   */
  const handleOk = () => {
    if (!formData.name.trim()) {
      setNameError(`${t('knowledgeBase.chats.name')} is required`)
      return
    }
    if (formData.category_ids.length === 0) {
      return
    }
    setNameError('')
    onOk(formData)
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('knowledgeBase.chats.edit') : t('knowledgeBase.chats.add')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* SECTION 1: Chat Setting (basic) */}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('knowledgeBase.chats.name')} <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder={t('knowledgeBase.chats.namePlaceholder')}
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
              {t('knowledgeBase.chats.description')}
            </label>
            <Input
              placeholder={t('knowledgeBase.chats.descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
            />
          </div>

          {/* Empty Response */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('knowledgeBase.chats.emptyResponse')}
            </label>
            <Textarea rows={2} value={formData.prompt_config.empty_response}
              onChange={(e) => updatePrompt('empty_response', e.target.value)} />
          </div>

          {/* Opener */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('knowledgeBase.chats.opener')}
            </label>
            <Textarea rows={3} value={formData.prompt_config.opener}
              onChange={(e) => updatePrompt('opener', e.target.value)} />
          </div>

          {/* Toggle flags row */}
          <div className="flex flex-wrap gap-6 mb-4">
            <div className="flex items-center gap-2">
              <Switch
                id="show-quote"
                checked={formData.prompt_config.show_quote}
                onCheckedChange={(v: boolean) => updatePrompt('show_quote', v)}
              />
              <Label htmlFor="show-quote" className="text-sm">{t('knowledgeBase.chats.showQuote')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="keyword-analysis"
                checked={formData.prompt_config.keyword}
                onCheckedChange={(v: boolean) => updatePrompt('keyword', v)}
              />
              <Label htmlFor="keyword-analysis" className="text-sm">{t('knowledgeBase.chats.keywordAnalysis')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="tts"
                checked={formData.prompt_config.tts}
                onCheckedChange={(v: boolean) => updatePrompt('tts', v)}
              />
              <Label htmlFor="tts" className="text-sm">{t('knowledgeBase.chats.tts')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="refine-multiturn"
                checked={formData.prompt_config.refine_multiturn}
                onCheckedChange={(v: boolean) => updatePrompt('refine_multiturn', v)}
              />
              <Label htmlFor="refine-multiturn" className="text-sm">{t('knowledgeBase.chats.refineMultiturn')}</Label>
            </div>
          </div>

          <Separator />

          {/* SECTION 2: Datasets (category selection) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('knowledgeBase.chats.selectCategories')} <span className="text-red-500">*</span>
            </label>
            {hasAnyDatasets ? (
              <div className="flex flex-col gap-2">
                {categoryOptions.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`cat-${opt.value}`}
                      checked={formData.category_ids.includes(opt.value)}
                      disabled={opt.disabled}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          updateField('category_ids', [...formData.category_ids, opt.value])
                        } else {
                          updateField('category_ids', formData.category_ids.filter((id) => id !== opt.value))
                        }
                      }}
                    />
                    <Label
                      htmlFor={`cat-${opt.value}`}
                      className={`text-sm ${opt.disabled ? 'text-muted-foreground' : ''}`}
                    >
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </div>
            ) : (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t('knowledgeBase.chats.noActiveDatasets')}</AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* SECTION 3: Prompt / Retrieval Configuration */}
          <CollapsibleSection title={t('knowledgeBase.chats.promptSection')}>
            <div className="space-y-4">
              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.systemPrompt')}</label>
                <Textarea rows={6} value={formData.prompt_config.prompt}
                  onChange={(e) => updatePrompt('prompt', e.target.value)} />
              </div>

              {/* Similarity Threshold */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.similarityThreshold')}</label>
                <SliderInput min={0} max={1} step={0.01}
                  value={formData.prompt_config.similarity_threshold}
                  onChange={(v) => updatePrompt('similarity_threshold', v)} />
              </div>

              {/* Vector Similarity Weight */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.vectorSimilarityWeight')}</label>
                <VectorWeightControl
                  value={formData.prompt_config.keywords_similarity_weight}
                  onChange={(v) => updatePrompt('keywords_similarity_weight', v)} />
              </div>

              {/* Top N */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.topN')}</label>
                <SliderInput min={1} max={100} step={1}
                  value={formData.prompt_config.top_n}
                  onChange={(v) => updatePrompt('top_n', v)} />
              </div>

              {/* Rerank Model */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.rerankModel')}</label>
                <Input placeholder={t('knowledgeBase.chats.rerankModelPlaceholder')}
                  value={formData.prompt_config.rerank_model}
                  onChange={(e) => updatePrompt('rerank_model', e.target.value)} />
              </div>

              {/* Cross-language Search */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.crossLanguages')}</label>
                <div className="flex flex-wrap gap-2">
                  {CROSS_LANGUAGE_OPTIONS.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => toggleCrossLanguage(lang)}
                      className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                        formData.prompt_config.cross_languages.includes(lang)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-input hover:bg-accent'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              {/* Variables */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.variables')}</label>
                {formData.prompt_config.variables.map((variable, index) => (
                  <div key={index} className="flex items-center gap-2 mb-2">
                    <Input
                      placeholder={t('knowledgeBase.chats.variableKey')}
                      className="w-[160px]"
                      value={variable.key}
                      onChange={(e) => updateVariable(index, 'key', e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {t('knowledgeBase.chats.variableOptional')}
                    </span>
                    <Switch
                      checked={variable.optional}
                      onCheckedChange={(v: boolean) => updateVariable(index, 'optional', v)}
                    />
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeVariable(index)}>
                      x
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addVariable}>
                  + {t('knowledgeBase.chats.addVariable')}
                </Button>
              </div>
            </div>
          </CollapsibleSection>

          <Separator />

          {/* SECTION 4: LLM Configuration */}
          <CollapsibleSection title={t('knowledgeBase.chats.llmSection')}>
            <div className="space-y-4">
              {/* Model */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.modelName')}</label>
                <Select
                  value={formData.llm_config.model_name || undefined}
                  onValueChange={(v: string) => updateLlm('model_name', v || '')}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('knowledgeBase.chats.selectModel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {chatModels.length > 0 ? (
                      chatModels.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">{t('knowledgeBase.chats.noModels')}</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Creativity */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.creativity')}</label>
                <Select
                  onValueChange={(val: string) => {
                    if (val && val !== 'custom' && CREATIVITY_PRESETS[val]) {
                      const preset = CREATIVITY_PRESETS[val]
                      setFormData((prev) => ({
                        ...prev,
                        llm_config: { ...prev.llm_config, ...preset },
                      }))
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('knowledgeBase.chats.selectCreativity')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="improvise">{t('knowledgeBase.chats.creativityImprovise')}</SelectItem>
                    <SelectItem value="precise">{t('knowledgeBase.chats.creativityPrecise')}</SelectItem>
                    <SelectItem value="balance">{t('knowledgeBase.chats.creativityBalance')}</SelectItem>
                    <SelectItem value="custom">{t('knowledgeBase.chats.creativityCustom')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Temperature */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.temperature')}</label>
                <SliderInput min={0} max={1} step={0.01}
                  value={formData.llm_config.temperature}
                  onChange={(v) => updateLlm('temperature', v)} />
              </div>

              {/* Top P */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.topP')}</label>
                <SliderInput min={0} max={1} step={0.01}
                  value={formData.llm_config.top_p}
                  onChange={(v) => updateLlm('top_p', v)} />
              </div>

              {/* Presence Penalty */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.presencePenalty')}</label>
                <SliderInput min={0} max={1} step={0.01}
                  value={formData.llm_config.presence_penalty}
                  onChange={(v) => updateLlm('presence_penalty', v)} />
              </div>

              {/* Frequency Penalty */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.frequencyPenalty')}</label>
                <SliderInput min={0} max={1} step={0.01}
                  value={formData.llm_config.frequency_penalty}
                  onChange={(v) => updateLlm('frequency_penalty', v)} />
              </div>

              {/* Max Tokens */}
              <div>
                <label className="block text-sm font-medium mb-1">{t('knowledgeBase.chats.maxTokens')}</label>
                <MaxTokensControl
                  value={formData.llm_config.max_tokens}
                  onChange={(v) => updateLlm('max_tokens', v)} />
              </div>
            </div>
          </CollapsibleSection>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
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

export default ChatModal
