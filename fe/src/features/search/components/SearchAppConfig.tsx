/**
 * @fileoverview Dialog configuration panel for search app settings.
 * Allows selecting datasets, tuning search parameters, configuring LLM,
 * cross-language search, feature toggles, and running retrieval tests.
 * Enhanced with model dropdowns, rerank Top K, LLM presets, and metadata filter.
 * @module features/ai/components/SearchAppConfig
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { EmojiPicker } from '@/components/EmojiPicker'
import { ModelSelector } from '@/components/model-selector/ModelSelector'
import { LlmSettingFields, type LlmSettingValue } from '@/components/llm-setting-fields/LlmSettingFields'
import { RerankSelector } from '@/components/rerank-selector/RerankSelector'
import { MetadataFilterEditor } from '@/components/metadata-filter/MetadataFilterEditor'
import { CrossLanguageSelector } from '@/components/cross-language/CrossLanguageSelector'
import { KnowledgeBasePicker, type KnowledgeBaseItem } from '@/components/knowledge-base-picker/KnowledgeBasePicker'
import { SearchRetrievalTest } from './SearchRetrievalTest'
import type { SearchApp, CreateSearchAppPayload } from '../types/search.types'
import type { MetadataFilter } from '@/components/metadata-filter/metadata-filter.types'

// ============================================================================
// Props
// ============================================================================

/** @description Props for the SearchAppConfig dialog component */
interface SearchAppConfigProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Callback when configuration is saved */
  onSave: (data: CreateSearchAppPayload) => void
  /** Existing search app data for editing (null for new) */
  app?: SearchApp | null
  /** Available datasets for selection */
  datasets?: KnowledgeBaseItem[]
  /** Available knowledge bases for selection */
  knowledgeBases?: KnowledgeBaseItem[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Configuration dialog for creating or editing a search app.
 * Includes dataset selection, public toggle, search parameter sliders,
 * model dropdowns (rerank + LLM), LLM presets with per-param toggles,
 * cross-language, feature toggles, metadata filter, and retrieval test.
 *
 * @param {SearchAppConfigProps} props - Component properties
 * @returns {JSX.Element} The rendered configuration dialog
 */
function SearchAppConfig({
  open,
  onClose,
  onSave,
  app,
  datasets = [],
  knowledgeBases = [],
}: SearchAppConfigProps) {
  const { t } = useTranslation()

  // ---- Basic form state ----
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState('')
  const [emptyResponse, setEmptyResponse] = useState('')
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [similarityThreshold, setSimilarityThreshold] = useState(0.2)
  const [topK, setTopK] = useState(5)
  const [searchMethod, setSearchMethod] = useState<'hybrid' | 'semantic' | 'fulltext'>('hybrid')
  const [vectorWeight, setVectorWeight] = useState(0.7)

  // ---- Rerank model + Top K ----
  const [rerankId, setRerankId] = useState('')
  const [rerankTopK, setRerankTopK] = useState(1024)

  // ---- Cross-language ----
  const [crossLanguages, setCrossLanguages] = useState('')

  // ---- Feature toggles ----
  const [keywordEnabled, setKeywordEnabled] = useState(false)
  const [useKg, setUseKg] = useState(false)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [tavilyApiKey, setTavilyApiKey] = useState('')
  const [enableRelatedQuestions, setEnableRelatedQuestions] = useState(true)
  const [enableMindmap, setEnableMindmap] = useState(true)
  const [highlightEnabled, setHighlightEnabled] = useState(true)

  // ---- LLM config ----
  const [llmId, setLlmId] = useState('')
  const [enableSummary, setEnableSummary] = useState(true)
  const [llmSetting, setLlmSetting] = useState<LlmSettingValue>({
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

  /**
   * Validate the current form state before save.
   * Returns the first blocking error message or null when the form is valid.
   */
  const getValidationError = () => {
    if (!name.trim()) return t('common.fieldRequired', { field: t('common.name') })
    if (selectedDatasets.length === 0) return t('searchAdmin.validation.datasetsRequired')
    if (enableSummary && !llmId) return t('searchAdmin.validation.llmRequired')
    if (webSearchEnabled && !tavilyApiKey.trim()) return t('searchAdmin.validation.tavilyRequired')
    return null
  }

  const validationError = getValidationError()



  // Populate form when editing an existing search app
  useEffect(() => {
    if (app) {
      const cfg = app.search_config
      setName(app.name)
      setDescription(app.description || '')
      setAvatar(app.avatar ?? '')
      setEmptyResponse(app.empty_response ?? '')
      setSelectedDatasets(app.dataset_ids)
      setIsPublic(app.is_public ?? false)
      setSimilarityThreshold(cfg?.similarity_threshold ?? 0.2)
      setTopK(cfg?.top_k ?? 5)
      setSearchMethod(cfg?.search_method ?? 'hybrid')
      setVectorWeight(cfg?.vector_similarity_weight ?? 0.7)
      setRerankId(cfg?.rerank_id ?? '')
      setRerankTopK(cfg?.rerank_top_k ?? 1024)
      setCrossLanguages(cfg?.cross_languages ?? '')
      setKeywordEnabled(cfg?.keyword ?? false)
      setUseKg(cfg?.use_kg ?? false)
      setWebSearchEnabled(cfg?.web_search ?? false)
      setTavilyApiKey(cfg?.tavily_api_key ?? '')
      setEnableRelatedQuestions(cfg?.enable_related_questions ?? true)
      setEnableMindmap(cfg?.enable_mindmap ?? true)
      setHighlightEnabled(cfg?.highlight ?? true)
      setLlmId(cfg?.llm_id ?? '')
      setEnableSummary(cfg?.enable_summary ?? true)

      // Populate LLM settings from existing config
      if (cfg?.llm_setting) {
        setLlmSetting({
          temperature: cfg.llm_setting.temperature ?? 0.1,
          temperatureEnabled: cfg.llm_setting.temperatureEnabled ?? true,
          top_p: cfg.llm_setting.top_p ?? 0.3,
          topPEnabled: cfg.llm_setting.topPEnabled ?? false,
          frequency_penalty: cfg.llm_setting.frequency_penalty ?? 0.7,
          frequencyPenaltyEnabled: cfg.llm_setting.frequencyPenaltyEnabled ?? false,
          presence_penalty: cfg.llm_setting.presence_penalty ?? 0.4,
          presencePenaltyEnabled: cfg.llm_setting.presencePenaltyEnabled ?? false,
          max_tokens: cfg.llm_setting.max_tokens ?? 512,
          maxTokensEnabled: cfg.llm_setting.maxTokensEnabled ?? false,
        })
      }

      // Populate metadata filter from existing config
      if (cfg?.metadata_filter) {
        setMetadataFilter(cfg.metadata_filter)
      }
    } else {
      // Reset for new search app
      setName('')
      setDescription('')
      setAvatar('')
      setEmptyResponse('')
      setSelectedDatasets([])
      setIsPublic(false)
      setSimilarityThreshold(0.2)
      setTopK(5)
      setSearchMethod('hybrid')
      setVectorWeight(0.7)
      setRerankId('')
      setRerankTopK(1024)
      setCrossLanguages('')
      setKeywordEnabled(false)
      setUseKg(false)
      setWebSearchEnabled(false)
      setTavilyApiKey('')
      setEnableRelatedQuestions(true)
      setEnableMindmap(true)
      setHighlightEnabled(true)
      setLlmId('')
      setEnableSummary(true)
      setLlmSetting({
        temperature: 0.1, temperatureEnabled: true,
        top_p: 0.3, topPEnabled: false,
        frequency_penalty: 0.7, frequencyPenaltyEnabled: false,
        presence_penalty: 0.4, presencePenaltyEnabled: false,
        max_tokens: 512, maxTokensEnabled: false,
      })
      setMetadataFilter({ logic: 'and', conditions: [] })
    }
  }, [app, open])



  /**
   * @description Handle form save with all new fields included.
   */
  const handleSave = () => {
    // Guard: require non-empty name
    if (validationError) return

    const search_config: CreateSearchAppPayload['search_config'] = {
      similarity_threshold: similarityThreshold,
      top_k: topK,
      search_method: searchMethod,
      vector_similarity_weight: vectorWeight,
      rerank_id: rerankId || undefined,
      rerank_top_k: rerankId ? rerankTopK : undefined,
      llm_id: enableSummary ? llmId || undefined : undefined,
      llm_setting: enableSummary ? llmSetting : undefined,
      cross_languages: crossLanguages || undefined,
      keyword: keywordEnabled,
      highlight: highlightEnabled,
      use_kg: useKg,
      web_search: webSearchEnabled,
      tavily_api_key: webSearchEnabled ? tavilyApiKey.trim() || undefined : undefined,
      enable_summary: enableSummary,
      enable_related_questions: enableRelatedQuestions,
      enable_mindmap: enableMindmap,
    }

    // Only include metadata filter if conditions exist
    if (metadataFilter.conditions.length > 0) {
      search_config!.metadata_filter = metadataFilter
    }

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      avatar: avatar || undefined,
      empty_response: emptyResponse || undefined,
      dataset_ids: selectedDatasets,
      is_public: isPublic,
      search_config,
    })

    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {app ? t('searchAdmin.editApp') : t('searchAdmin.createApp')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Basic Settings */}
          <div className="space-y-1.5">
            <Label>{t('common.name')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('common.name')} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('common.description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('common.description')} />
          </div>
          {/* Avatar emoji picker for search app branding */}
          <div className="space-y-2">
            <Label>{t('searchAdmin.avatar')}</Label>
            <EmojiPicker value={avatar} onChange={setAvatar} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.isPublic')}</Label>
              <p className="text-xs text-muted-foreground">{t('searchAdmin.publicDesc')}</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          {/* Knowledge bases multi-select (datasets + knowledge bases) */}
          <div className="space-y-1.5">
            <Label>{t('chat.knowledgeBases')}</Label>
            <KnowledgeBasePicker
              value={selectedDatasets}
              onChange={setSelectedDatasets}
              datasets={datasets}
              knowledgeBases={knowledgeBases}
            />
          </div>

          {/* Search Parameters */}
          <Separator />
          <h4 className="text-sm font-medium">{t('searchAdmin.searchParams')}</h4>
          <div className="space-y-1.5">
            <Label>{t('searchAdmin.searchMethod')}</Label>
            <select value={searchMethod} onChange={(e) => setSearchMethod(e.target.value as 'hybrid' | 'semantic' | 'fulltext')} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="hybrid">{t('search.method.hybrid')}</option>
              <option value="semantic">{t('search.method.semantic')}</option>
              <option value="fulltext">{t('search.method.fulltext')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('searchAdmin.similarityThreshold')}</Label>
              <span className="text-xs text-muted-foreground">{similarityThreshold.toFixed(2)}</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" value={similarityThreshold} onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))} className="w-full accent-primary" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('searchAdmin.topK')}</Label>
              <span className="text-xs text-muted-foreground">{topK}</span>
            </div>
            <input type="range" min="1" max="50" step="1" value={topK} onChange={(e) => setTopK(parseInt(e.target.value))} className="w-full accent-primary" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('searchAdmin.vectorWeight')}</Label>
              <span className="text-xs text-muted-foreground">{vectorWeight.toFixed(2)}</span>
            </div>
            <input type="range" min="0" max="1" step="0.05" value={vectorWeight} onChange={(e) => setVectorWeight(parseFloat(e.target.value))} className="w-full accent-primary" />
          </div>

          {/* Rerank model dropdown + conditional Top K slider */}
          <RerankSelector
            rerankId={rerankId}
            topK={rerankTopK}
            onRerankChange={setRerankId}
            onTopKChange={setRerankTopK}
          />

          {/* Metadata Filter */}
          <Separator />
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{t('metadataFilter.title')}</h4>
            <MetadataFilterEditor value={metadataFilter} onChange={setMetadataFilter} />
          </div>

          {/* Cross-Language Search */}
          <Separator />
          <CrossLanguageSelector value={crossLanguages} onChange={setCrossLanguages} />

          {/* LLM Configuration */}
          <Separator />
          <h4 className="text-sm font-medium">{t('searchAdmin.llmConfig')}</h4>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.enableSummary')}</Label>
              <p className="text-xs text-muted-foreground">{t('searchAdmin.enableSummaryDesc')}</p>
            </div>
            <Switch checked={enableSummary} onCheckedChange={setEnableSummary} />
          </div>

          {/* LLM model selector and parameter fields (only when summary is enabled) */}
          {enableSummary && (
            <>
              <div className="space-y-1.5">
                <Label>{t('searchAdmin.llmModel')}</Label>
                <ModelSelector
                  modelType="chat"
                  value={llmId}
                  onChange={setLlmId}
                  placeholder={t('searchAdmin.llmModelPlaceholder')}
                />
              </div>

              {/* LLM settings with presets -- no max_tokens for search summary */}
              <LlmSettingFields
                value={llmSetting}
                onChange={setLlmSetting}
                showFields={['temperature', 'top_p', 'presence_penalty', 'frequency_penalty']}
              />
            </>
          )}

          {/* Feature Toggles */}
          <Separator />
          <h4 className="text-sm font-medium">{t('searchAdmin.featureToggles')}</h4>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.keywordExtraction')}</Label>
              <p className="text-xs text-muted-foreground">{t('searchAdmin.keywordExtractionDesc')}</p>
            </div>
            <Switch checked={keywordEnabled} onCheckedChange={setKeywordEnabled} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.knowledgeGraph')}</Label>
              <p className="text-xs text-muted-foreground">{t('searchAdmin.knowledgeGraphDesc')}</p>
            </div>
            <Switch checked={useKg} onCheckedChange={setUseKg} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.webSearch')}</Label>
              <p className="text-xs text-muted-foreground">{t('searchAdmin.webSearchDesc')}</p>
            </div>
            <Switch checked={webSearchEnabled} onCheckedChange={setWebSearchEnabled} />
          </div>
          {webSearchEnabled && (
            <div className="space-y-1.5 pl-4 border-l-2 border-primary/20">
              <Label>{t('searchAdmin.tavilyApiKey')}</Label>
              <Input type="password" value={tavilyApiKey} onChange={(e) => setTavilyApiKey(e.target.value)} placeholder={t('searchAdmin.tavilyApiKeyPlaceholder')} />
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.relatedQuestions')}</Label>
              <p className="text-xs text-muted-foreground">{t('searchAdmin.relatedQuestionsDesc')}</p>
            </div>
            <Switch checked={enableRelatedQuestions} onCheckedChange={setEnableRelatedQuestions} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.mindMap')}</Label>
              <p className="text-xs text-muted-foreground">{t('searchAdmin.mindMapDesc')}</p>
            </div>
            <Switch checked={enableMindmap} onCheckedChange={setEnableMindmap} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.highlight')}</Label>
              <p className="text-xs text-muted-foreground">{t('searchAdmin.highlightDesc')}</p>
            </div>
            <Switch checked={highlightEnabled} onCheckedChange={setHighlightEnabled} />
          </div>

          {/* Custom empty response message */}
          <div className="space-y-2">
            <Label>{t('searchAdmin.emptyResponse')}</Label>
            <p className="text-xs text-muted-foreground">{t('searchAdmin.emptyResponseDesc')}</p>
            <Textarea
              value={emptyResponse}
              onChange={(e) => setEmptyResponse(e.target.value)}
              placeholder={t('search.noResults')}
              rows={2}
            />
          </div>

          {/* Retrieval Test (only for existing apps) */}
          {app && (
            <>
              <Separator />
              <SearchRetrievalTest appId={app.id} />
            </>
          )}
        </div>

        <DialogFooter>
          {validationError && (
            <p className="mr-auto text-sm text-destructive">
              {validationError}
            </p>
          )}
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={!!validationError}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SearchAppConfig
