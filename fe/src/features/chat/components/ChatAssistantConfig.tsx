/**
 * @fileoverview Dialog configuration panel for chat assistant settings.
 * Three-section layout matching RAGFlow parity: Basic Info, Prompt Engine, LLM Model Settings.
 * @module features/chat/components/ChatAssistantConfig
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ModelSelector } from '@/components/model-selector/ModelSelector'
import { LlmSettingFields, type LlmSettingValue } from '@/components/llm-setting-fields/LlmSettingFields'
import { RerankSelector } from '@/components/rerank-selector/RerankSelector'
import { MetadataFilterEditor } from '@/components/metadata-filter/MetadataFilterEditor'
import { CrossLanguageSelector } from '@/components/cross-language/CrossLanguageSelector'
import { KnowledgeBasePicker, type KnowledgeBaseItem } from '@/components/knowledge-base-picker/KnowledgeBasePicker'
import MultiLangInput from '@/components/multi-lang-input/MultiLangInput'
import ChatVariableForm from './ChatVariableForm'
import type {
  ChatAssistant,
  CreateAssistantPayload,
  PromptConfig,
  PromptVariable,
  ChatLlmSetting,
} from '../types/chat.types'
import type { MetadataFilter } from '@/components/metadata-filter/metadata-filter.types'

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

/** Available assistant language options */
const LANGUAGE_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
] as const

// ============================================================================
// Props
// ============================================================================

/**
 * @description Props for the ChatAssistantConfig dialog component.
 */
interface ChatAssistantConfigProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Callback when configuration is saved */
  onSave: (data: CreateAssistantPayload) => void
  /** Existing dialog data for editing (null for new) */
  dialog?: ChatAssistant | null
  /** Available datasets for selection */
  datasets?: KnowledgeBaseItem[]
  /** Available projects for selection */
  projects?: KnowledgeBaseItem[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Configuration dialog for creating or editing a chat assistant.
 * Three-section layout:
 *   1. Basic Information (name, description, language, public, KB selection, empty response, welcome, feature toggles)
 *   2. Prompt Engine (system prompt, retrieval sliders, rerank, cross-language, metadata filter, variables)
 *   3. LLM Model Settings (model selector, preset + 5 parameter sliders)
 *
 * @param {ChatAssistantConfigProps} props - Component properties
 * @returns {JSX.Element} The rendered configuration dialog
 */
function ChatAssistantConfig({
  open,
  onClose,
  onSave,
  dialog,
  datasets = [],
  projects = [],
}: ChatAssistantConfigProps) {
  const { t } = useTranslation()

  // ---- Basic Info state ----
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedKbs, setSelectedKbs] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [language, setLanguage] = useState('')

  // ---- Prompt config state ----
  const [systemPrompt, setSystemPrompt] = useState('')
  const [prologue, setPrologue] = useState<Record<string, string>>({ en: '', vi: '', ja: '' })
  const [emptyResponse, setEmptyResponse] = useState<Record<string, string>>({ en: '', vi: '', ja: '' })
  const [variables, setVariables] = useState<PromptVariable[]>([])

  // ---- Feature flags ----
  const [quote, setQuote] = useState(true)
  const [keyword, setKeyword] = useState(false)
  const [tts, setTts] = useState(false)
  const [tocEnhance, setTocEnhance] = useState(false)
  const [refineMultiturn, setRefineMultiturn] = useState(true)
  const [useKg, setUseKg] = useState(false)
  const [reasoning, setReasoning] = useState(false)
  const [allowRbacDatasets, setAllowRbacDatasets] = useState(false)

  // ---- Retrieval parameters ----
  const [topN, setTopN] = useState(6)
  const [similarityThreshold, setSimilarityThreshold] = useState(0.2)
  const [vectorWeight, setVectorWeight] = useState(0.3)
  const [crossLanguages, setCrossLanguages] = useState('')

  // ---- Rerank ----
  const [rerankId, setRerankId] = useState('')
  const [topK, setTopK] = useState(1024)

  // ---- LLM model selection ----
  const [llmId, setLlmId] = useState('')

  // ---- LLM sampling parameters ----
  const [llmSetting, setLlmSetting] = useState<ChatLlmSetting>({
    temperature: 0.1, temperatureEnabled: true,
    top_p: 0.3, topPEnabled: false,
    frequency_penalty: 0.7, frequencyPenaltyEnabled: false,
    presence_penalty: 0.4, presencePenaltyEnabled: false,
    max_tokens: 512, maxTokensEnabled: false,
  })

  // ---- Metadata filter ----
  const [metadataFilter, setMetadataFilter] = useState<MetadataFilter>({
    logic: 'and', conditions: [],
  })

  // Populate form when editing an existing dialog, or reset for new
  useEffect(() => {
    if (dialog) {
      setName(dialog.name)
      setDescription(dialog.description ?? '')
      setSelectedKbs(dialog.kb_ids)
      setIsPublic(dialog.is_public ?? false)
      setLlmId(dialog.llm_id ?? '')
      setVariables(dialog.prompt_config.variables ?? [])

      // Prompt config fields
      const pc = dialog.prompt_config
      setSystemPrompt(pc.system ?? '')
      // Handle both legacy string and per-locale Record for prologue
      setPrologue(
        typeof pc.prologue === 'object' && pc.prologue !== null
          ? pc.prologue as Record<string, string>
          : { en: (pc.prologue as string) ?? '', vi: '', ja: '' }
      )
      // Handle both legacy string and per-locale Record for empty_response
      setEmptyResponse(
        typeof pc.empty_response === 'object' && pc.empty_response !== null
          ? pc.empty_response as Record<string, string>
          : { en: (pc.empty_response as string) ?? '', vi: '', ja: '' }
      )
      setLanguage(pc.language ?? '')

      // Feature flags
      setQuote(pc.quote ?? true)
      setKeyword(pc.keyword ?? false)
      setTts(pc.tts ?? false)
      setTocEnhance(pc.toc_enhance ?? false)
      setRefineMultiturn(pc.refine_multiturn ?? true)
      setUseKg(pc.use_kg ?? false)
      setReasoning(pc.reasoning ?? false)
      setAllowRbacDatasets(pc.allow_rbac_datasets ?? false)

      // Retrieval parameters
      setTopN(pc.top_n ?? 6)
      setSimilarityThreshold(pc.similarity_threshold ?? 0.2)
      setVectorWeight(pc.vector_similarity_weight ?? 0.3)
      setCrossLanguages(pc.cross_languages ?? '')
      setRerankId(pc.rerank_id ?? '')
      setTopK(pc.top_k ?? 1024)

      // LLM settings
      if (pc.llm_setting) setLlmSetting(pc.llm_setting)

      // Metadata filter
      if (pc.metadata_filter) setMetadataFilter(pc.metadata_filter)
    } else {
      // Reset all state for new assistant
      setName('')
      setDescription('')
      setSelectedKbs([])
      setIsPublic(false)
      setLanguage('')
      setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
      setPrologue({ en: '', vi: '', ja: '' })
      setEmptyResponse({ en: '', vi: '', ja: '' })
      setVariables([])
      setQuote(true)
      setKeyword(false)
      setTts(false)
      setTocEnhance(false)
      setRefineMultiturn(true)
      setUseKg(false)
      setReasoning(false)
      setAllowRbacDatasets(false)
      setTopN(6)
      setSimilarityThreshold(0.2)
      setVectorWeight(0.3)
      setCrossLanguages('')
      setRerankId('')
      setTopK(1024)
      setLlmId('')
      setLlmSetting({
        temperature: 0.1, temperatureEnabled: true,
        top_p: 0.3, topPEnabled: false,
        frequency_penalty: 0.7, frequencyPenaltyEnabled: false,
        presence_penalty: 0.4, presencePenaltyEnabled: false,
        max_tokens: 512, maxTokensEnabled: false,
      })
      setMetadataFilter({ logic: 'and', conditions: [] })
    }
  }, [dialog, open])

  /**
   * @description Validate and submit the form, building a full prompt config payload.
   */
  const handleSave = () => {
    // Guard: require non-empty name
    if (!name.trim()) return

    // Filter out variables with empty keys
    const validVars = variables.filter((v) => v.key.trim())

    // Build prompt_config with all fields
    const prompt_config: Partial<PromptConfig> = {
      system: systemPrompt || undefined,
      // Send per-locale map; strip empty values
      prologue: Object.values(prologue).some(v => v.trim()) ? prologue : undefined,
      empty_response: Object.values(emptyResponse).some(v => v.trim()) ? emptyResponse : undefined,
      language: language || undefined,
      // Feature flags
      quote,
      keyword,
      tts,
      toc_enhance: tocEnhance,
      refine_multiturn: refineMultiturn,
      use_kg: useKg,
      reasoning,
      allow_rbac_datasets: allowRbacDatasets,
      // Retrieval
      top_n: topN,
      top_k: topK,
      similarity_threshold: similarityThreshold,
      vector_similarity_weight: vectorWeight,
      cross_languages: crossLanguages || undefined,
      rerank_id: rerankId || undefined,
      // LLM sampling
      llm_setting: llmSetting,
      // Variables
      variables: validVars.length > 0 ? validVars : undefined,
      // Metadata filter (only send if conditions exist)
      metadata_filter: metadataFilter.conditions.length > 0 ? metadataFilter : undefined,
    }

    onSave({
      name: name.trim(),
      description: description || undefined,
      kb_ids: selectedKbs,
      llm_id: llmId || undefined,
      is_public: isPublic,
      prompt_config,
    })

    onClose()
  }

  const dialogTitle = dialog ? t('chat.editDialog') : t('chat.createDialog')

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {dialogTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ================================================================
              SECTION 1: Basic Information
              ================================================================ */}
          <h4 className="text-sm font-semibold text-foreground">
            {t('chatSettings.basicInfo')}
          </h4>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('common.name')} *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('chat.dialogNamePlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring dark:border-gray-600"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('common.description')}</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('chat.dialogDescriptionPlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring dark:border-gray-600"
            />
          </div>

          {/* Language selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('chatSettings.language')}</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm dark:border-gray-600"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('chatAdmin.isPublic')}</p>
              <p className="text-xs text-muted-foreground">{t('chatAdmin.publicDesc')}</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          {/* Knowledge bases multi-select (datasets + projects) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('chat.knowledgeBases')}</label>
            <KnowledgeBasePicker
              value={selectedKbs}
              onChange={setSelectedKbs}
              datasets={datasets}
              projects={projects}
            />
          </div>

          {/* Empty Response (per-language) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('chatSettings.emptyResponse')}</label>
            <MultiLangInput
              value={emptyResponse}
              onChange={setEmptyResponse}
              placeholder={t('chatSettings.emptyResponsePlaceholder')}
              multiline
            />
          </div>

          {/* Welcome Message — per-language (prologue) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('chat.welcomeMessage')}</label>
            <MultiLangInput
              value={prologue}
              onChange={setPrologue}
              placeholder={t('chat.welcomeMessagePlaceholder')}
            />
          </div>

          {/* Feature Toggles */}
          <div className="space-y-2">
            <h5 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              {t('chatSettings.featureFlags')}
            </h5>

            {/* Quote / Citation */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('chatSettings.quote')}</p>
                <p className="text-xs text-muted-foreground">{t('chatSettings.quoteDesc')}</p>
              </div>
              <Switch checked={quote} onCheckedChange={setQuote} />
            </div>

            {/* Keyword Extraction */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('chatSettings.keyword')}</p>
                <p className="text-xs text-muted-foreground">{t('chatSettings.keywordDesc')}</p>
              </div>
              <Switch checked={keyword} onCheckedChange={setKeyword} />
            </div>

            {/* TTS */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('chatSettings.tts')}</p>
                <p className="text-xs text-muted-foreground">{t('chatSettings.ttsDesc')}</p>
              </div>
              <Switch checked={tts} onCheckedChange={setTts} />
            </div>

            {/* TOC Enhance */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('chatSettings.tocEnhance')}</p>
                <p className="text-xs text-muted-foreground">{t('chatSettings.tocEnhanceDesc')}</p>
              </div>
              <Switch checked={tocEnhance} onCheckedChange={setTocEnhance} />
            </div>

            {/* Deep Research mode (renamed from Reasoning) */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('chatSettings.deepResearch')}</p>
                <p className="text-xs text-muted-foreground">{t('chatSettings.deepResearchDesc')}</p>
              </div>
              <Switch checked={reasoning} onCheckedChange={setReasoning} />
            </div>

            {/* Allow RBAC Datasets for cross-dataset search */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('chatSettings.allowRbacDatasets')}</p>
                <p className="text-xs text-muted-foreground">{t('chatSettings.allowRbacDatasetsDesc')}</p>
              </div>
              <Switch checked={allowRbacDatasets} onCheckedChange={setAllowRbacDatasets} />
            </div>
          </div>

          {/* ================================================================
              SECTION 2: Prompt Engine
              ================================================================ */}
          <Separator />
          <h4 className="text-sm font-semibold text-foreground">
            {t('chatSettings.promptConfig')}
          </h4>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('chat.systemPrompt')}</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('chat.systemPromptPlaceholder')}
              className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y dark:border-gray-600"
            />
          </div>

          {/* Similarity Threshold slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t('chatSettings.similarityThreshold')}</label>
              <span className="text-xs tabular-nums text-muted-foreground">{similarityThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={similarityThreshold}
              onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Vector Weight slider with split display */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t('chatSettings.vectorWeight')}</label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('chatSettings.vectorSearch')}: {vectorWeight.toFixed(2)} | {t('chatSettings.keywordSearch')}: {(1 - vectorWeight).toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t('chatSettings.vectorWeightDesc')}</p>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={vectorWeight}
              onChange={(e) => setVectorWeight(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Top N slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t('chat.topN')}</label>
              <span className="text-xs tabular-nums text-muted-foreground">{topN}</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              step="1"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Refine Multiturn */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('chatSettings.refineMultiturn')}</p>
              <p className="text-xs text-muted-foreground">{t('chatSettings.refineMultiturnDesc')}</p>
            </div>
            <Switch checked={refineMultiturn} onCheckedChange={setRefineMultiturn} />
          </div>

          {/* Knowledge Graph mode — labels existing use_kg toggle per CONTEXT.md */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('chatSettings.knowledgeGraph')}</p>
              <p className="text-xs text-muted-foreground">{t('chatSettings.knowledgeGraphDesc')}</p>
            </div>
            <Switch checked={useKg} onCheckedChange={setUseKg} />
          </div>

          {/* Rerank Selector */}
          <RerankSelector
            rerankId={rerankId}
            topK={topK}
            onRerankChange={setRerankId}
            onTopKChange={setTopK}
          />

          {/* Cross-Language Search */}
          <CrossLanguageSelector value={crossLanguages} onChange={setCrossLanguages} />

          {/* Metadata Filter */}
          <div className="space-y-2">
            <h5 className="text-sm font-medium">{t('metadataFilter.title')}</h5>
            <MetadataFilterEditor value={metadataFilter} onChange={setMetadataFilter} />
          </div>

          {/* Separator before Variables section */}
          <Separator />

          {/* Custom Prompt Variables */}
          <ChatVariableForm value={variables} onChange={setVariables} />

          {/* ================================================================
              SECTION 3: LLM Model Settings
              ================================================================ */}
          <Separator />
          <h4 className="text-sm font-semibold text-foreground">
            {t('chatSettings.llmConfig')}
          </h4>

          {/* LLM Model Selector */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('llmSettings.llmModel')}</label>
            <ModelSelector
              modelType="chat"
              value={llmId}
              onChange={setLlmId}
              placeholder={t('llmSettings.llmModelPlaceholder')}
            />
          </div>

          {/* LLM Parameter Settings (all 5 params with presets) */}
          <LlmSettingFields
            value={llmSetting as LlmSettingValue}
            onChange={(v) => setLlmSetting(v as ChatLlmSetting)}
          />
        </div>

        <DialogFooter>
          <button
            className="px-4 py-2 text-sm font-medium rounded-lg border bg-background hover:bg-muted transition-colors dark:border-gray-600"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            {t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ChatAssistantConfig
