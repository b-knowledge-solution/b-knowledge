/**
 * @fileoverview Dialog configuration panel for search app settings.
 * Allows selecting datasets, tuning search parameters, configuring LLM,
 * cross-language search, feature toggles, and running retrieval tests.
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
import { searchApi } from '../api/searchApi'
import { SearchCrossLanguage } from './SearchCrossLanguage'
import { SearchRetrievalTest } from './SearchRetrievalTest'
import type { SearchApp, CreateSearchAppPayload } from '../types/search.types'

// ============================================================================
// Props
// ============================================================================

interface SearchAppConfigProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Callback when configuration is saved */
  onSave: (data: CreateSearchAppPayload) => void
  /** Existing search app data for editing (null for new) */
  app?: SearchApp | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Configuration dialog for creating or editing a search app.
 * Includes dataset selection, public toggle, search parameter sliders,
 * rerank model, cross-language, feature toggles, LLM config, and retrieval test.
 *
 * @param {SearchAppConfigProps} props - Component properties
 * @returns {JSX.Element} The rendered configuration dialog
 */
function SearchAppConfig({
  open,
  onClose,
  onSave,
  app,
}: SearchAppConfigProps) {
  const { t } = useTranslation()

  // Available datasets for selection
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([])

  // ---- Basic form state ----
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([])
  const [isPublic, setIsPublic] = useState(false)
  const [similarityThreshold, setSimilarityThreshold] = useState(0.2)
  const [topK, setTopK] = useState(5)
  const [searchMethod, setSearchMethod] = useState<'hybrid' | 'semantic' | 'fulltext'>('hybrid')
  const [vectorWeight, setVectorWeight] = useState(0.7)

  // ---- Rerank model ----
  const [rerankId, setRerankId] = useState('')

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
  const [temperature, setTemperature] = useState(0.1)
  const [enableSummary, setEnableSummary] = useState(true)

  // Fetch available datasets on open
  useEffect(() => {
    if (open) {
      searchApi.listDatasets().then(setDatasets).catch(console.error)
    }
  }, [open])

  // Populate form when editing an existing search app
  useEffect(() => {
    if (app) {
      const cfg = app.search_config
      setName(app.name)
      setDescription(app.description || '')
      setSelectedDatasets(app.dataset_ids)
      setIsPublic(app.is_public ?? false)
      setSimilarityThreshold(cfg?.similarity_threshold ?? 0.2)
      setTopK(cfg?.top_k ?? 5)
      setSearchMethod(cfg?.search_method ?? 'hybrid')
      setVectorWeight(cfg?.vector_similarity_weight ?? 0.7)
      setRerankId(cfg?.rerank_id ?? '')
      setCrossLanguages(cfg?.cross_languages ?? '')
      setKeywordEnabled(cfg?.keyword ?? false)
      setUseKg(cfg?.use_kg ?? false)
      setWebSearchEnabled(cfg?.web_search ?? false)
      setTavilyApiKey(cfg?.tavily_api_key ?? '')
      setEnableRelatedQuestions(cfg?.enable_related_questions ?? true)
      setEnableMindmap(cfg?.enable_mindmap ?? true)
      setHighlightEnabled(cfg?.highlight ?? true)
      setLlmId(cfg?.llm_id ?? '')
      setTemperature(cfg?.llm_setting?.temperature ?? 0.1)
      setEnableSummary(cfg?.enable_summary ?? true)
    } else {
      // Reset for new search app
      setName('')
      setDescription('')
      setSelectedDatasets([])
      setIsPublic(false)
      setSimilarityThreshold(0.2)
      setTopK(5)
      setSearchMethod('hybrid')
      setVectorWeight(0.7)
      setRerankId('')
      setCrossLanguages('')
      setKeywordEnabled(false)
      setUseKg(false)
      setWebSearchEnabled(false)
      setTavilyApiKey('')
      setEnableRelatedQuestions(true)
      setEnableMindmap(true)
      setHighlightEnabled(true)
      setLlmId('')
      setTemperature(0.1)
      setEnableSummary(true)
    }
  }, [app, open])

  /**
   * Toggle a dataset in the selection.
   * @param datasetId - Dataset ID to toggle
   */
  const toggleDataset = (datasetId: string) => {
    setSelectedDatasets((prev) =>
      prev.includes(datasetId) ? prev.filter((id) => id !== datasetId) : [...prev, datasetId],
    )
  }

  /**
   * Handle form save.
   */
  const handleSave = () => {
    // Guard: require non-empty name
    if (!name.trim()) return

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      dataset_ids: selectedDatasets,
      is_public: isPublic,
      search_config: {
        similarity_threshold: similarityThreshold,
        top_k: topK,
        search_method: searchMethod,
        vector_similarity_weight: vectorWeight,
        rerank_id: rerankId.trim() || undefined,
        cross_languages: crossLanguages || undefined,
        keyword: keywordEnabled,
        highlight: highlightEnabled,
        use_kg: useKg,
        web_search: webSearchEnabled,
        tavily_api_key: webSearchEnabled ? tavilyApiKey.trim() || undefined : undefined,
        enable_summary: enableSummary,
        enable_related_questions: enableRelatedQuestions,
        enable_mindmap: enableMindmap,
        llm_id: llmId.trim() || undefined,
        llm_setting: {
          temperature,
        },
      },
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
          {/* ================================================================
              Basic Settings
              ================================================================ */}

          {/* Name */}
          <div className="space-y-1.5">
            <Label>{t('common.name')} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('common.name')}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>{t('common.description')}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('common.description')}
            />
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.isPublic')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('searchAdmin.publicDesc')}
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          {/* Dataset multi-select */}
          <div className="space-y-1.5">
            <Label>{t('searchAdmin.datasets')}</Label>
            <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
              {datasets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">
                  {t('common.noData')}
                </p>
              ) : (
                datasets.map((ds) => (
                  <label
                    key={ds.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDatasets.includes(ds.id)}
                      onChange={() => toggleDataset(ds.id)}
                      className="rounded border-input"
                    />
                    <span>{ds.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* ================================================================
              Search Parameters
              ================================================================ */}

          <Separator />
          <h4 className="text-sm font-medium">{t('searchAdmin.searchParams')}</h4>

          {/* Search method select */}
          <div className="space-y-1.5">
            <Label>{t('searchAdmin.searchMethod')}</Label>
            <select
              value={searchMethod}
              onChange={(e) => setSearchMethod(e.target.value as 'hybrid' | 'semantic' | 'fulltext')}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="hybrid">{t('search.method.hybrid')}</option>
              <option value="semantic">{t('search.method.semantic')}</option>
              <option value="fulltext">{t('search.method.fulltext')}</option>
            </select>
          </div>

          {/* Similarity threshold slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('searchAdmin.similarityThreshold')}</Label>
              <span className="text-xs text-muted-foreground">{similarityThreshold.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={similarityThreshold}
              onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Top K slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('searchAdmin.topK')}</Label>
              <span className="text-xs text-muted-foreground">{topK}</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Vector similarity weight slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('searchAdmin.vectorWeight')}</Label>
              <span className="text-xs text-muted-foreground">{vectorWeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={vectorWeight}
              onChange={(e) => setVectorWeight(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Rerank model */}
          <div className="space-y-1.5">
            <Label>{t('searchAdmin.rerankModel')}</Label>
            <Input
              value={rerankId}
              onChange={(e) => setRerankId(e.target.value)}
              placeholder={t('searchAdmin.rerankModelPlaceholder')}
            />
          </div>

          {/* ================================================================
              Cross-Language Search
              ================================================================ */}

          <Separator />
          <SearchCrossLanguage value={crossLanguages} onChange={setCrossLanguages} />

          {/* ================================================================
              LLM Configuration
              ================================================================ */}

          <Separator />
          <h4 className="text-sm font-medium">{t('searchAdmin.llmConfig')}</h4>

          {/* Enable AI Summary */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.enableSummary')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('searchAdmin.enableSummaryDesc')}
              </p>
            </div>
            <Switch checked={enableSummary} onCheckedChange={setEnableSummary} />
          </div>

          {/* LLM model input (only relevant when summary is enabled) */}
          {enableSummary && (
            <>
              <div className="space-y-1.5">
                <Label>{t('searchAdmin.llmModel')}</Label>
                <Input
                  value={llmId}
                  onChange={(e) => setLlmId(e.target.value)}
                  placeholder={t('searchAdmin.llmModelPlaceholder')}
                />
              </div>

              {/* Temperature slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t('searchAdmin.temperature')}</Label>
                  <span className="text-xs text-muted-foreground">{temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </>
          )}

          {/* ================================================================
              Feature Toggles
              ================================================================ */}

          <Separator />
          <h4 className="text-sm font-medium">{t('searchAdmin.featureToggles')}</h4>

          {/* Keyword extraction */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.keywordExtraction')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('searchAdmin.keywordExtractionDesc')}
              </p>
            </div>
            <Switch checked={keywordEnabled} onCheckedChange={setKeywordEnabled} />
          </div>

          {/* Knowledge graph */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.knowledgeGraph')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('searchAdmin.knowledgeGraphDesc')}
              </p>
            </div>
            <Switch checked={useKg} onCheckedChange={setUseKg} />
          </div>

          {/* Web search */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.webSearch')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('searchAdmin.webSearchDesc')}
              </p>
            </div>
            <Switch checked={webSearchEnabled} onCheckedChange={setWebSearchEnabled} />
          </div>

          {/* Tavily API key (shown only when web search is enabled) */}
          {webSearchEnabled && (
            <div className="space-y-1.5 pl-4 border-l-2 border-primary/20">
              <Label>{t('searchAdmin.tavilyApiKey')}</Label>
              <Input
                type="password"
                value={tavilyApiKey}
                onChange={(e) => setTavilyApiKey(e.target.value)}
                placeholder={t('searchAdmin.tavilyApiKeyPlaceholder')}
              />
            </div>
          )}

          {/* Related questions */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.relatedQuestions')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('searchAdmin.relatedQuestionsDesc')}
              </p>
            </div>
            <Switch checked={enableRelatedQuestions} onCheckedChange={setEnableRelatedQuestions} />
          </div>

          {/* Mind map */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.mindMap')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('searchAdmin.mindMapDesc')}
              </p>
            </div>
            <Switch checked={enableMindmap} onCheckedChange={setEnableMindmap} />
          </div>

          {/* Highlight terms */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('searchAdmin.highlight')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('searchAdmin.highlightDesc')}
              </p>
            </div>
            <Switch checked={highlightEnabled} onCheckedChange={setHighlightEnabled} />
          </div>

          {/* ================================================================
              Retrieval Test (only for existing apps)
              ================================================================ */}

          {app && (
            <>
              <Separator />
              <SearchRetrievalTest appId={app.id} />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default SearchAppConfig
