/**
 * @fileoverview Modal form for creating/updating a chat assistant with full RAGFlow config.
 *
 * Uses native useState instead of Ant Design Form.
 *
 * @module features/projects/components/ChatModal
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
  Alert,
  Select,
  Divider,
  Button,
} from 'antd'
import type {
  DocumentCategory,
  DocumentCategoryVersion,
  ProjectChat,
} from '../api/projectApi'

const { TextArea } = Input
const { Text } = Typography

// ============================================================================
// Constants
// ============================================================================

/** Default system prompt matching RAGFlow's chat.py default */
const DEFAULT_SYSTEM_PROMPT = `You are an intelligent assistant. Please summarize the content of the dataset to answer the question. Please list the data in the dataset and answer in detail. When all dataset content is irrelevant to the question, your answer must include the sentence "The answer you are looking for is not found in the dataset!" Answers need to consider chat history.
  Here is the knowledge base:
  {knowledge}
  The above is the knowledge base.`

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

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Custom control for Vector Similarity Weight that shows dual labels.
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
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{t('projectManagement.common.vector')} <strong>{vectorVal}</strong></span>
        <span>{t('projectManagement.common.fullText')} <strong>{fulltextVal}</strong></span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Slider min={0} max={1} step={0.01} value={value} onChange={onChange} />
        </div>
        <InputNumber
          min={0} max={1} step={0.01}
          value={value}
          onChange={(v: number | null) => onChange?.(v ?? 0)}
          style={{ width: 70 }}
        />
      </div>
    </div>
  )
}

/**
 * Reusable Slider + InputNumber combo as a single controlled component.
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
    <div className="flex-1">
      <Slider min={min} max={max} step={step} value={value} onChange={onChange}
        tooltip={{ formatter: (v?: number) => `${v}` }} />
    </div>
    <InputNumber min={min} max={max} step={step} value={value}
      onChange={(v: number | null) => onChange?.(v ?? min)}
      style={{ width: inputWidth }} />
  </div>
)

/**
 * Specialized control for Max Tokens.
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
      <div className="flex-1">
        <Slider min={1} max={SLIDER_MAX} step={1}
          value={Math.min(value, SLIDER_MAX)} onChange={onChange} />
      </div>
      <InputNumber min={1} max={INPUT_MAX} step={1} value={value}
        onChange={(v: number | null) => onChange?.(v ?? 512)}
        style={{ width: 80 }} />
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
  /** Project document categories */
  categories: DocumentCategory[]
  /** Map of category ID -> its versions (pre-fetched) */
  categoryVersions: Record<string, DocumentCategoryVersion[]>
  /** Available chat models from the RAGFlow server config */
  chatModels: string[]
  /** Existing chat data for edit mode (null = create mode) */
  editingChat: ProjectChat | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal dialog with a full form for creating/editing a chat assistant.
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
   * Build checkbox options from categories.
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
   * Update a top-level field.
   */
  const updateField = <K extends keyof ChatFormData>(field: K, value: ChatFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Update a prompt_config field.
   */
  const updatePrompt = <K extends keyof PromptConfig>(field: K, value: PromptConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      prompt_config: { ...prev.prompt_config, [field]: value },
    }))
  }

  /**
   * Update an llm_config field.
   */
  const updateLlm = <K extends keyof LlmConfig>(field: K, value: LlmConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      llm_config: { ...prev.llm_config, [field]: value },
    }))
  }

  /**
   * Add a new variable entry.
   */
  const addVariable = () => {
    updatePrompt('variables', [...formData.prompt_config.variables, { key: '', optional: false }])
  }

  /**
   * Remove a variable by index.
   */
  const removeVariable = (index: number) => {
    updatePrompt('variables', formData.prompt_config.variables.filter((_, i) => i !== index))
  }

  /**
   * Update a variable field by index.
   */
  const updateVariable = (index: number, field: 'key' | 'optional', value: string | boolean) => {
    const updated = formData.prompt_config.variables.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    )
    updatePrompt('variables', updated)
  }

  /**
   * Validate and submit.
   */
  const handleOk = () => {
    if (!formData.name.trim()) {
      setNameError(`${t('projectManagement.chats.name')} is required`)
      return
    }
    if (formData.category_ids.length === 0) {
      return
    }
    setNameError('')
    onOk(formData)
  }

  return (
    <Modal
      title={isEditing ? t('projectManagement.chats.edit') : t('projectManagement.chats.add')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={saving}
      destroyOnHidden
      width={640}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
    >
      <div className="mt-4 space-y-4">
        {/* SECTION 1: Chat Setting (basic) */}

        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.chats.name')} <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder={t('projectManagement.chats.namePlaceholder')}
            value={formData.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              updateField('name', e.target.value)
              if (nameError) setNameError('')
            }}
            status={nameError ? 'error' : undefined}
          />
          {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.chats.description')}
          </label>
          <Input
            placeholder={t('projectManagement.chats.descriptionPlaceholder')}
            value={formData.description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('description', e.target.value)}
          />
        </div>

        {/* Empty Response */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.chats.emptyResponse')}
          </label>
          <TextArea rows={2} value={formData.prompt_config.empty_response}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updatePrompt('empty_response', e.target.value)} />
        </div>

        {/* Opener */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.chats.opener')}
          </label>
          <TextArea rows={3} value={formData.prompt_config.opener}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updatePrompt('opener', e.target.value)} />
        </div>

        {/* Toggle flags row */}
        <div className="flex flex-wrap gap-6 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.showQuote')}</label>
            <Switch checked={formData.prompt_config.show_quote}
              onChange={(v: boolean) => updatePrompt('show_quote', v)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.keywordAnalysis')}</label>
            <Switch checked={formData.prompt_config.keyword}
              onChange={(v: boolean) => updatePrompt('keyword', v)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.tts')}</label>
            <Switch checked={formData.prompt_config.tts}
              onChange={(v: boolean) => updatePrompt('tts', v)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.refineMultiturn')}</label>
            <Switch checked={formData.prompt_config.refine_multiturn}
              onChange={(v: boolean) => updatePrompt('refine_multiturn', v)} />
          </div>
        </div>

        <Divider />

        {/* SECTION 2: Datasets (category selection) */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.chats.selectCategories')} <span className="text-red-500">*</span>
          </label>
          {hasAnyDatasets ? (
            <Checkbox.Group
              options={categoryOptions}
              className="flex flex-col gap-2"
              value={formData.category_ids}
              onChange={(vals: string[]) => updateField('category_ids', vals)}
            />
          ) : (
            <Alert message={t('projectManagement.chats.noActiveDatasets')} type="warning" showIcon />
          )}
        </div>

        <Divider />

        {/* SECTION 3: Prompt / Retrieval Configuration */}
        <Collapse
          ghost
          defaultActiveKey={[]}
          items={[
            {
              key: 'prompt',
              label: <Text strong>{t('projectManagement.chats.promptSection')}</Text>,
              children: (
                <div className="space-y-4">
                  {/* System Prompt */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.systemPrompt')}</label>
                    <TextArea rows={6} value={formData.prompt_config.prompt}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updatePrompt('prompt', e.target.value)} />
                  </div>

                  {/* Similarity Threshold */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.similarityThreshold')}</label>
                    <SliderInput min={0} max={1} step={0.01}
                      value={formData.prompt_config.similarity_threshold}
                      onChange={(v) => updatePrompt('similarity_threshold', v)} />
                  </div>

                  {/* Vector Similarity Weight */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.vectorSimilarityWeight')}</label>
                    <VectorWeightControl
                      value={formData.prompt_config.keywords_similarity_weight}
                      onChange={(v) => updatePrompt('keywords_similarity_weight', v)} />
                  </div>

                  {/* Top N */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.topN')}</label>
                    <SliderInput min={1} max={100} step={1}
                      value={formData.prompt_config.top_n}
                      onChange={(v) => updatePrompt('top_n', v)} />
                  </div>

                  {/* Rerank Model */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.rerankModel')}</label>
                    <Input allowClear placeholder={t('projectManagement.chats.rerankModelPlaceholder')}
                      value={formData.prompt_config.rerank_model}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePrompt('rerank_model', e.target.value)} />
                  </div>

                  {/* Cross-language Search */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.crossLanguages')}</label>
                    <Select
                      mode="tags"
                      allowClear
                      placeholder={t('projectManagement.chats.crossLanguagesPlaceholder')}
                      value={formData.prompt_config.cross_languages}
                      onChange={(v: string[]) => updatePrompt('cross_languages', v)}
                      className="w-full"
                      options={[
                        { label: 'English', value: 'English' },
                        { label: 'Chinese', value: 'Chinese' },
                        { label: 'Japanese', value: 'Japanese' },
                        { label: 'Vietnamese', value: 'Vietnamese' },
                        { label: 'Korean', value: 'Korean' },
                        { label: 'French', value: 'French' },
                        { label: 'German', value: 'German' },
                        { label: 'Spanish', value: 'Spanish' },
                      ]}
                    />
                  </div>

                  {/* Variables */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.variables')}</label>
                    {formData.prompt_config.variables.map((variable, index) => (
                      <div key={index} className="flex items-center gap-2 mb-2">
                        <Input
                          placeholder={t('projectManagement.chats.variableKey')}
                          style={{ width: 160 }}
                          value={variable.key}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateVariable(index, 'key', e.target.value)}
                        />
                        <span className="text-xs text-gray-400">
                          {t('projectManagement.chats.variableOptional')}
                        </span>
                        <Switch
                          size="small"
                          checked={variable.optional}
                          onChange={(v: boolean) => updateVariable(index, 'optional', v)}
                        />
                        <Button type="text" size="small" danger onClick={() => removeVariable(index)}>
                          x
                        </Button>
                      </div>
                    ))}
                    <Button type="dashed" size="small" onClick={addVariable}>
                      + {t('projectManagement.chats.addVariable')}
                    </Button>
                  </div>
                </div>
              ),
            },
          ]}
        />

        <Divider />

        {/* SECTION 4: LLM Configuration */}
        <Collapse
          ghost
          defaultActiveKey={[]}
          items={[
            {
              key: 'llm',
              label: <Text strong>{t('projectManagement.chats.llmSection')}</Text>,
              children: (
                <div className="space-y-4">
                  {/* Model */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.modelName')}</label>
                    <Select
                      showSearch allowClear
                      placeholder={t('projectManagement.chats.selectModel')}
                      options={chatModels.map((m) => ({ label: m, value: m }))}
                      notFoundContent={t('projectManagement.chats.noModels')}
                      value={formData.llm_config.model_name || undefined}
                      onChange={(v: string) => updateLlm('model_name', v || '')}
                      className="w-full"
                    />
                  </div>

                  {/* Creativity */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.creativity')}</label>
                    <Select
                      allowClear
                      placeholder={t('projectManagement.chats.selectCreativity')}
                      options={[
                        { label: t('projectManagement.chats.creativityImprovise'), value: 'improvise' },
                        { label: t('projectManagement.chats.creativityPrecise'), value: 'precise' },
                        { label: t('projectManagement.chats.creativityBalance'), value: 'balance' },
                        { label: t('projectManagement.chats.creativityCustom'), value: 'custom' },
                      ]}
                      className="w-full"
                      onChange={(val: string) => {
                        if (val && val !== 'custom' && CREATIVITY_PRESETS[val]) {
                          const preset = CREATIVITY_PRESETS[val]
                          setFormData((prev) => ({
                            ...prev,
                            llm_config: { ...prev.llm_config, ...preset },
                          }))
                        }
                      }}
                    />
                  </div>

                  {/* Temperature */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.temperature')}</label>
                    <SliderInput min={0} max={1} step={0.01}
                      value={formData.llm_config.temperature}
                      onChange={(v) => updateLlm('temperature', v)} />
                  </div>

                  {/* Top P */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.topP')}</label>
                    <SliderInput min={0} max={1} step={0.01}
                      value={formData.llm_config.top_p}
                      onChange={(v) => updateLlm('top_p', v)} />
                  </div>

                  {/* Presence Penalty */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.presencePenalty')}</label>
                    <SliderInput min={0} max={1} step={0.01}
                      value={formData.llm_config.presence_penalty}
                      onChange={(v) => updateLlm('presence_penalty', v)} />
                  </div>

                  {/* Frequency Penalty */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.frequencyPenalty')}</label>
                    <SliderInput min={0} max={1} step={0.01}
                      value={formData.llm_config.frequency_penalty}
                      onChange={(v) => updateLlm('frequency_penalty', v)} />
                  </div>

                  {/* Max Tokens */}
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('projectManagement.chats.maxTokens')}</label>
                    <MaxTokensControl
                      value={formData.llm_config.max_tokens}
                      onChange={(v) => updateLlm('max_tokens', v)} />
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    </Modal>
  )
}

export default ChatModal
