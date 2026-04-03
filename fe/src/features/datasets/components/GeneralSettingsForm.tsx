/**
 * @fileoverview RAGFlow-aligned unified dataset configuration form.
 *
 * Organized into 5 sections matching RAGFlow's Configuration page:
 * 1. Basic — name, language, description, embedding model, page rank, tag sets
 * 2. Ingestion Pipeline — parser, PDF parser, chunk size, delimiter, toggles, sliders + right panel with SVG images
 * 3. Global Index — GraphRAG settings
 * 4. RAPTOR — summarization settings
 *
 * Validation constants sourced from RAGFlow.
 *
 * @module features/datasets/components/GeneralSettingsForm
 */

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Save, X, Plus, Info, AlertTriangle, Loader2 } from 'lucide-react'
import type { DatasetSettings, GraphRAGConfig, RAPTORConfig } from '../types'
import {
  LANGUAGE_OPTIONS, PARSER_OPTIONS, PDF_PARSER_OPTIONS, PARSER_DESCRIPTIONS,
} from '../types'
import { useProviders } from '@/features/llm-provider/api/llmProviderQueries'
import { useReEmbedDataset } from '../api/datasetQueries'
import { useConfirm } from '@/components/ConfirmDialog'
import { ModelType } from '@/constants'

// ============================================================================
// Known embedding model dimensions for mismatch detection
// ============================================================================

/** Known vector dimensions per embedding model name */
const KNOWN_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'BAAI/bge-m3': 1024,
  'BAAI/bge-large-en-v1.5': 1024,
  'BAAI/bge-base-en-v1.5': 768,
  'sentence-transformers/all-MiniLM-L6-v2': 384,
}

// ============================================================================
// Pipeline introduction SVG imports
// ============================================================================

import naive01 from '@/assets/svg/chunk-method/naive-01.svg'
import naive02 from '@/assets/svg/chunk-method/naive-02.svg'
import book01 from '@/assets/svg/chunk-method/book-01.svg'
import book02 from '@/assets/svg/chunk-method/book-02.svg'
import law01 from '@/assets/svg/chunk-method/law-01.svg'
import law02 from '@/assets/svg/chunk-method/law-02.svg'
import manual01 from '@/assets/svg/chunk-method/manual-01.svg'
import manual02 from '@/assets/svg/chunk-method/manual-02.svg'
import paper01 from '@/assets/svg/chunk-method/paper-01.svg'
import paper02 from '@/assets/svg/chunk-method/paper-02.svg'
import presentation01 from '@/assets/svg/chunk-method/presentation-01.svg'
import presentation02 from '@/assets/svg/chunk-method/presentation-02.svg'
import qa01 from '@/assets/svg/chunk-method/qa-01.svg'
import qa02 from '@/assets/svg/chunk-method/qa-02.svg'
import resume01 from '@/assets/svg/chunk-method/resume-01.svg'
import resume02 from '@/assets/svg/chunk-method/resume-02.svg'
import table01 from '@/assets/svg/chunk-method/table-01.svg'
import table02 from '@/assets/svg/chunk-method/table-02.svg'
import one01 from '@/assets/svg/chunk-method/one-01.svg'
import one02 from '@/assets/svg/chunk-method/one-02.svg'
import knowledgeGraph01 from '@/assets/svg/chunk-method/knowledge-graph-01.svg'
import knowledgeGraph02 from '@/assets/svg/chunk-method/knowledge-graph-02.svg'

/** Map parser_id → list of illustration SVGs */
const PARSER_IMAGES: Record<string, string[]> = {
  naive: [naive01, naive02],
  qa: [qa01, qa02],
  resume: [resume01, resume02],
  manual: [manual01, manual02],
  table: [table01, table02],
  paper: [paper01, paper02],
  book: [book01, book02],
  laws: [law01, law02],
  presentation: [presentation01, presentation02],
  one: [one01, one02],
  knowledge_graph: [knowledgeGraph01, knowledgeGraph02],
}

// ============================================================================
// RAGFlow validation constants
// ============================================================================

/** Chunk token number: min 1, max 2048, default 512 */
const CHUNK_TOKEN_MIN = 1
const CHUNK_TOKEN_MAX = 2048
const CHUNK_TOKEN_DEFAULT = 512
const CHUNK_TOKEN_STEP = 32

/** Auto keywords: min 0, max 32, default 0 */
const AUTO_KEYWORDS_MIN = 0
const AUTO_KEYWORDS_MAX = 32
const AUTO_KEYWORDS_DEFAULT = 0

/** Auto questions: min 0, max 10, default 0 */
const AUTO_QUESTIONS_MIN = 0
const AUTO_QUESTIONS_MAX = 10
const AUTO_QUESTIONS_DEFAULT = 0

/** Overlapped percent: min 0, max 100, default 0 */
const OVERLAPPED_MIN = 0
const OVERLAPPED_MAX = 100
const OVERLAPPED_DEFAULT = 0

/** Page rank: min 0, max 100, default 0 */
const PAGERANK_MIN = 0
const PAGERANK_MAX = 100

/** Image & table context window: min 0, max 10, default 0 */
const IMG_TABLE_CTX_MIN = 0
const IMG_TABLE_CTX_MAX = 256
const IMG_TABLE_CTX_DEFAULT = 0

// ============================================================================
// Types
// ============================================================================

interface GeneralSettingsFormProps {
  /** Current settings */
  settings: DatasetSettings
  /** Whether saving */
  saving: boolean
  /** Save handler */
  onSave: (data: Partial<DatasetSettings>) => Promise<void>
}

// ============================================================================
// Helpers
// ============================================================================

/** Default RAPTOR prompt used by advance-rag */
const DEFAULT_RAPTOR_PROMPT =
  'Please summarize the following paragraphs. Be careful with the numbers, do not make things up. Paragraphs as following:\n      {cluster_content}\nThe above is the content you need to summarize.'

const DEFAULT_ENTITY_TYPES = ['organization', 'person', 'geo', 'event', 'category']

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Tag chip input component for managing lists of string tags.
 * Supports Enter key to add, Backspace to remove last, and inline plus button.
 *
 * @param {{ tags: string[]; onChange: (tags: string[]) => void; placeholder?: string }} props
 * @returns {JSX.Element} Rendered chip input
 */
const TagChipInput: React.FC<{
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}> = ({ tags, onChange, placeholder }) => {
  const [input, setInput] = useState('')

  const addTag = () => {
    const trimmed = input.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-background px-3 py-2 min-h-[40px]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-sm"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); addTag() }
          if (e.key === 'Backspace' && !input && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={addTag}
        placeholder={tags.length === 0 ? (placeholder || 'Type and press Enter') : ''}
        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={addTag}
        className="text-muted-foreground hover:text-foreground"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}

/**
 * @description Slider field with range input, numeric input, label, and optional tooltip.
 * Clamps value within [min, max] on blur.
 *
 * @param {{ label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; tooltip?: string }} props
 * @returns {JSX.Element} Rendered slider with numeric input
 */
const SliderField: React.FC<{
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  tooltip?: string
}> = ({ label, value, onChange, min = 0, max = 10, step = 1, tooltip }) => {
  /** Clamp value within [min, max] on blur */
  const clamp = (v: number) => Math.max(min, Math.min(max, v))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {tooltip && (
          <span title={tooltip} className="text-muted-foreground cursor-help">
            <Info className="w-3.5 h-3.5" />
          </span>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{min} – {max}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={(e) => onChange(clamp(Number(e.target.value)))}
          className="w-16 h-8 text-center text-sm"
        />
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * @description Unified dataset configuration form organized into 5 sections:
 * Basic (name, language, embedding model, page rank, tags),
 * Ingestion Pipeline (parser, chunk size, toggles, sliders),
 * Data Source (placeholder), Global Index (GraphRAG settings),
 * and RAPTOR (summarization settings). Includes a right panel with
 * parser method illustrations.
 *
 * @param {GeneralSettingsFormProps} props - Component properties
 * @returns {JSX.Element} Rendered settings form with side panel
 */
const GeneralSettingsForm: React.FC<GeneralSettingsFormProps> = ({
  settings,
  saving,
  onSave,
}) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { data: providers } = useProviders()
  const embeddingModels = providers?.filter((p) => p.model_type === ModelType.EMBEDDING) || []

  // ---- Re-embed mismatch detection ----
  const reEmbedMutation = useReEmbedDataset(settings.id)
  const [isReEmbedQueued, setIsReEmbedQueued] = useState(false)

  // Derive current default embedding model dimension from providers list
  const defaultEmbeddingProvider = providers?.find(
    (p) => p.model_type === ModelType.EMBEDDING && p.is_default
  )
  const currentModelDimension = defaultEmbeddingProvider
    ? KNOWN_DIMENSIONS[defaultEmbeddingProvider.model_name] ?? null
    : null

  // Dataset's stored embedding dimension (if present on the settings)
  const datasetDimension = (settings as unknown as Record<string, unknown>).embedding_dimension as number | null | undefined

  // Show mismatch banner when both dimensions are known and differ
  const showMismatchBanner = datasetDimension && currentModelDimension && datasetDimension !== currentModelDimension

  /**
   * Handle re-embed CTA click — shows confirmation dialog then triggers mutation.
   */
  const handleReEmbed = async () => {
    const confirmed = await confirm({
      title: t('datasetSettings.reembed.confirmTitle'),
      message: t('datasetSettings.reembed.confirmBody', { chunkCount: (settings as unknown as Record<string, unknown>).chunk_count || '?' }),
      variant: 'danger',
      confirmText: t('datasetSettings.reembed.confirmAction'),
    })
    if (!confirmed) return

    reEmbedMutation.mutate(undefined, {
      onSuccess: () => {
        setIsReEmbedQueued(true)
      },
    })
  }

  // ---- Section 1: Basic ----
  const [name, setName] = useState(settings.name)
  const [description, setDescription] = useState(settings.description || '')
  const [language, setLanguage] = useState(settings.language)
  const [embeddingModel, setEmbeddingModel] = useState(settings.embedding_model || '')
  const [pagerank, setPagerank] = useState(settings.pagerank || 0)
  const [tagSets, setTagSets] = useState<string[]>((settings.parser_config?.tag_sets as string[]) || [])

  // ---- Section 2: Ingestion Pipeline ----
  const [parserId, setParserId] = useState(settings.parser_id)
  const [parserConfig, setParserConfig] = useState<Record<string, unknown>>(
    settings.parser_config || {},
  )

  // ---- Section 4: Global Index (GraphRAG) ----
  const [graphrag, setGraphrag] = useState<GraphRAGConfig>(
    (settings.parser_config?.graphrag as GraphRAGConfig) || settings.graphrag || { enabled: false, use_graphrag: false },
  )

  // ---- Section 5: RAPTOR ----
  const [raptor, setRaptor] = useState<RAPTORConfig>(
    (settings.parser_config?.raptor as RAPTORConfig) || settings.raptor || { enabled: false, use_raptor: false },
  )

  // ---- Right panel visibility ----
  const [showIntroPanel, setShowIntroPanel] = useState(true)

  // ---- Ingestion convenience getters ----
  const chunkTokenNum = Number(parserConfig.chunk_token_num ?? CHUNK_TOKEN_DEFAULT)
  const delimiter = String(parserConfig.delimiter ?? '\\n')
  const layoutRecognize = String(parserConfig.layout_recognize ?? 'DeepDOC')
  const overlappedPercent = Number(parserConfig.overlapped_percent ?? OVERLAPPED_DEFAULT)
  const tocExtraction = Boolean(parserConfig.toc_extraction)
  const childChunk = Boolean(parserConfig.child_chunk)
  const childChunkDelimiter = String(parserConfig.child_chunk_delimiter ?? '\\n')
  const imageTableContext = Number(parserConfig.image_table_context ?? IMG_TABLE_CTX_DEFAULT)
  const autoKeywords = Number(parserConfig.auto_keywords ?? settings.auto_keywords ?? AUTO_KEYWORDS_DEFAULT)
  const autoQuestions = Number(parserConfig.auto_questions ?? settings.auto_questions ?? AUTO_QUESTIONS_DEFAULT)

  /** Helper to update a single parser_config key */
  const updateConfig = (key: string, value: unknown) => {
    setParserConfig((prev) => ({ ...prev, [key]: value }))
  }

  // Reset form when settings change
  useEffect(() => {
    setName(settings.name)
    setDescription(settings.description || '')
    setLanguage(settings.language)
    setEmbeddingModel(settings.embedding_model || '')
    setPagerank(settings.pagerank || 0)
    setTagSets((settings.parser_config?.tag_sets as string[]) || [])
    setParserId(settings.parser_id)
    setParserConfig(settings.parser_config || {})
    setGraphrag(
      (settings.parser_config?.graphrag as GraphRAGConfig) || settings.graphrag || { enabled: false, use_graphrag: false },
    )
    setRaptor(
      (settings.parser_config?.raptor as RAPTORConfig) || settings.raptor || { enabled: false, use_raptor: false },
    )
  }, [settings])

  /** Gather all state and send to parent */
  const handleSave = () => {
    // Merge graphrag + raptor + tag_sets into parser_config
    const mergedConfig: Record<string, unknown> = {
      ...parserConfig,
      tag_sets: tagSets,
      graphrag: {
        ...graphrag,
        use_graphrag: graphrag.enabled || graphrag.use_graphrag,
      },
      raptor: {
        ...raptor,
        use_raptor: raptor.enabled || raptor.use_raptor,
        prompt: raptor.prompt || DEFAULT_RAPTOR_PROMPT,
        max_token: raptor.max_token ?? 256,
        threshold: raptor.threshold ?? 0.1,
        max_cluster: raptor.max_cluster ?? 64,
        random_seed: raptor.random_seed ?? 0,
        scope: raptor.scope || 'file',
      },
    }

    onSave({
      name,
      description,
      language,
      embedding_model: embeddingModel || null,
      pagerank,
      parser_id: parserId,
      parser_config: mergedConfig,
    })
  }

  // Current parser description + images for the right panel
  const currentParserDesc = PARSER_DESCRIPTIONS[parserId] || PARSER_DESCRIPTIONS.naive
  const currentParserImages = PARSER_IMAGES[parserId] || [`/parsers/${parserId}.svg`]

  return (
    <div className="flex gap-6">
      {/* ===== LEFT: Settings Form ===== */}
      <div className="flex-1 space-y-8 min-w-0">
        {/* Show warning when embedding model dimension doesn't match stored chunks (per D-14) */}
        {showMismatchBanner && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 dark:border-yellow-800 dark:bg-yellow-950/30"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                {t('datasetSettings.reembed.mismatchTitle')}
              </span>
            </div>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              {t('datasetSettings.reembed.mismatchBody', {
                oldDimension: datasetDimension,
                newDimension: currentModelDimension,
              })}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReEmbed}
              disabled={reEmbedMutation.isPending || isReEmbedQueued}
              className="self-start"
            >
              {reEmbedMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('datasetSettings.reembed.queuing')}</>
              ) : isReEmbedQueued ? (
                t('datasetSettings.reembed.queued')
              ) : (
                t('datasetSettings.reembed.action')
              )}
            </Button>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* SECTION 1: BASIC                                          */}
        {/* --------------------------------------------------------- */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-primary">Basic</h3>

          {/* Name */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label className="text-red-500">*Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Language */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="grid grid-cols-[160px_1fr] items-start gap-4">
            <Label className="pt-2">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Embedding Model */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label className="text-red-500">*Embedding model</Label>
            <Select
              value={embeddingModel || 'default'}
              onValueChange={(v: string) => setEmbeddingModel(v === 'default' ? '' : v)}
            >
              <SelectTrigger><SelectValue placeholder="System default" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">System default</SelectItem>
                {embeddingModels.map((m) => (
                  <SelectItem key={m.model_name} value={m.model_name}>
                    {m.model_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page Rank */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>Page rank</Label>
              <span title="Higher page rank = higher priority in search results" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={PAGERANK_MIN}
                max={PAGERANK_MAX}
                value={pagerank}
                onChange={(e) => setPagerank(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <Input
                type="number"
                min={PAGERANK_MIN}
                max={PAGERANK_MAX}
                value={pagerank}
                onChange={(e) => setPagerank(Number(e.target.value))}
                onBlur={(e) => setPagerank(Math.max(PAGERANK_MIN, Math.min(PAGERANK_MAX, Number(e.target.value))))}
                className="w-16 h-8 text-center text-sm"
              />
            </div>
          </div>

          {/* Tag Sets */}
          <div className="grid grid-cols-[160px_1fr] items-start gap-4">
            <div className="flex items-center gap-1.5 pt-2">
              <Label>Tag sets</Label>
              <span title="Tags help categorize and filter datasets" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <TagChipInput
              tags={tagSets}
              onChange={setTagSets}
              placeholder="Add tags..."
            />
          </div>
        </section>

        <hr className="border-border" />

        {/* --------------------------------------------------------- */}
        {/* SECTION 2: INGESTION PIPELINE                             */}
        {/* --------------------------------------------------------- */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-primary">Ingestion pipeline</h3>

          {/* Parse type radio */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label>Parse type</Label>
            <RadioGroup defaultValue="builtin" className="flex items-center gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="builtin" id="settings-builtin" />
                <Label htmlFor="settings-builtin" className="font-normal">Built-in</Label>
              </div>
              <div className="flex items-center space-x-2 opacity-50">
                <RadioGroupItem value="pipeline" id="settings-pipeline" disabled />
                <Label htmlFor="settings-pipeline" className="font-normal text-muted-foreground">Choose pipeline</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Built-in parser */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label className="text-red-500">*Built-in</Label>
              <span title="Choose the document chunking strategy" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Select value={parserId} onValueChange={setParserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PARSER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* PDF Parser (layout recognize) */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>PDF parser</Label>
              <span title="Layout recognition engine for PDF files" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Select
              value={layoutRecognize}
              onValueChange={(v: string) => updateConfig('layout_recognize', v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PDF_PARSER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recommended chunk size — min 1, max 2048, step 32, default 512 */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>Recommended chunk size</Label>
              <span title={`Maximum tokens per chunk (${CHUNK_TOKEN_MIN}–${CHUNK_TOKEN_MAX})`} className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={CHUNK_TOKEN_MIN}
                max={CHUNK_TOKEN_MAX}
                step={CHUNK_TOKEN_STEP}
                value={chunkTokenNum}
                onChange={(e) => updateConfig('chunk_token_num', Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <Input
                type="number"
                min={CHUNK_TOKEN_MIN}
                max={CHUNK_TOKEN_MAX}
                value={chunkTokenNum}
                onChange={(e) => updateConfig('chunk_token_num', Number(e.target.value))}
                onBlur={(e) => updateConfig('chunk_token_num', Math.max(CHUNK_TOKEN_MIN, Math.min(CHUNK_TOKEN_MAX, Number(e.target.value))))}
                className="w-20 h-8 text-center text-sm"
              />
            </div>
          </div>

          {/* Delimiter */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label className="text-red-500">*Delimiter for text</Label>
              <span title="Characters used to split text into segments" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Input
              value={delimiter}
              onChange={(e) => updateConfig('delimiter', e.target.value)}
              placeholder="\n"
            />
          </div>

          {/* Child chunk toggle */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <Label>Child chunk are used for retrieval</Label>
            <Switch
              checked={childChunk}
              onCheckedChange={(checked: boolean) => updateConfig('child_chunk', checked)}
            />
          </div>

          {/* Child chunk delimiter — shown only when child chunk is enabled */}
          {childChunk && (
            <div className="grid grid-cols-[160px_1fr] items-center gap-4 ml-4 border-l-2 border-primary/20 pl-4">
              <div className="flex items-center gap-1.5">
                <Label className="text-red-500">*Delimiter for text</Label>
                <span title="Delimiter used to split child chunks from parent chunks" className="text-muted-foreground cursor-help">
                  <Info className="w-3.5 h-3.5" />
                </span>
              </div>
              <Input
                value={childChunkDelimiter}
                onChange={(e) => updateConfig('child_chunk_delimiter', e.target.value)}
                placeholder="\n"
              />
            </div>
          )}

          {/* TOC enhance */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>TOC enhance</Label>
              <span title="Extract table of contents for better chunking (naive parser only)" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Switch
              checked={tocExtraction}
              onCheckedChange={(checked: boolean) => updateConfig('toc_extraction', checked)}
            />
          </div>

          {/* Image & table context window — min 0, max 10 */}
          <SliderField
            label="Image & table context window"
            value={imageTableContext}
            onChange={(v) => updateConfig('image_table_context', v)}
            min={IMG_TABLE_CTX_MIN}
            max={IMG_TABLE_CTX_MAX}
            tooltip="Number of surrounding paragraphs to include as context for images/tables"
          />

          {/* Overlapped percent — min 0, max 100 */}
          <SliderField
            label="Overlapped percent (%)"
            value={overlappedPercent}
            onChange={(v) => updateConfig('overlapped_percent', v)}
            min={OVERLAPPED_MIN}
            max={OVERLAPPED_MAX}
            tooltip="Percentage of overlap between adjacent chunks"
          />

          {/* Auto-keyword — min 0, max 32 */}
          <SliderField
            label="Auto-keyword"
            value={autoKeywords}
            onChange={(v) => updateConfig('auto_keywords', v)}
            min={AUTO_KEYWORDS_MIN}
            max={AUTO_KEYWORDS_MAX}
            tooltip="Automatically extract N keywords per chunk (recommended: 3–5 for ~1,000 char chunks)"
          />

          {/* Auto-question — min 0, max 10 */}
          <SliderField
            label="Auto-question"
            value={autoQuestions}
            onChange={(v) => updateConfig('auto_questions', v)}
            min={AUTO_QUESTIONS_MIN}
            max={AUTO_QUESTIONS_MAX}
            tooltip="Automatically generate N questions per chunk (recommended: 1–2 for FAQ scenarios)"
          />
        </section>

        <hr className="border-border" />

        {/* --------------------------------------------------------- */}
        {/* SECTION 3: GLOBAL INDEX (GraphRAG)                        */}
        {/* --------------------------------------------------------- */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-primary">Global index</h3>

          {/* Indexing model */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>Indexing model</Label>
              <span title="Embedding model used for graph entity indexing" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Select
              value={embeddingModel || 'default'}
              onValueChange={(v: string) => setEmbeddingModel(v === 'default' ? '' : v)}
            >
              <SelectTrigger><SelectValue placeholder="Please select a embedding model." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">System default</SelectItem>
                {embeddingModels.map((m) => (
                  <SelectItem key={m.model_name} value={m.model_name}>
                    {m.model_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Knowledge graph status */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>Knowledge graph</Label>
              <span title="Status of the knowledge graph for this dataset" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Input
              value={graphrag.use_graphrag ? 'Generated' : 'Not generated'}
              disabled
              className="bg-muted"
            />
          </div>

          {/* Entity types */}
          <div className="grid grid-cols-[160px_1fr] items-start gap-4">
            <Label className="text-red-500 pt-2">*Entity types</Label>
            <TagChipInput
              tags={graphrag.entity_types || DEFAULT_ENTITY_TYPES}
              onChange={(tags) => setGraphrag((prev) => ({ ...prev, entity_types: tags }))}
              placeholder="Add entity type..."
            />
          </div>

          {/* Method */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>Method</Label>
              <span title="Knowledge graph extraction method" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Select
              value={graphrag.method || 'light'}
              onValueChange={(v: string) => setGraphrag((prev) => ({ ...prev, method: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entity resolution */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>Entity resolution</Label>
              <span title="Merge duplicate entities across documents" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Switch
              checked={graphrag.resolution || false}
              onCheckedChange={(checked: boolean) =>
                setGraphrag((prev) => ({ ...prev, resolution: checked }))
              }
            />
          </div>

          {/* Community reports */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>Community reports</Label>
              <span title="Generate community-level summary reports" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Switch
              checked={graphrag.community || false}
              onCheckedChange={(checked: boolean) =>
                setGraphrag((prev) => ({ ...prev, community: checked }))
              }
            />
          </div>
        </section>

        <hr className="border-border" />

        {/* --------------------------------------------------------- */}
        {/* SECTION 4: RAPTOR                                         */}
        {/* --------------------------------------------------------- */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-primary">RAPTOR</h3>

          {/* RAPTOR status */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>RAPTOR</Label>
              <span title="Recursive Abstractive Processing for Tree-Organized Retrieval" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Input
              value={raptor.use_raptor ? 'Generated' : 'Not generated'}
              disabled
              className="bg-muted"
            />
          </div>

          {/* Generation scope */}
          <div className="grid grid-cols-[160px_1fr] items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Label>Generation scope</Label>
              <span title="Whether RAPTOR runs per-file or across the entire dataset" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <RadioGroup
              value={raptor.scope || 'file'}
              onValueChange={(v: string) => setRaptor((prev) => ({ ...prev, scope: v as 'file' | 'dataset' }))}
              className="flex items-center gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dataset" id="scope-dataset" />
                <Label htmlFor="scope-dataset" className="font-normal">Dataset</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="file" id="scope-file" />
                <Label htmlFor="scope-file" className="font-normal">Single file</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Prompt */}
          <div className="grid grid-cols-[160px_1fr] items-start gap-4">
            <Label className="pt-2">Prompt</Label>
            <Textarea
              value={raptor.prompt || DEFAULT_RAPTOR_PROMPT}
              onChange={(e) => setRaptor((prev) => ({ ...prev, prompt: e.target.value }))}
              rows={4}
              placeholder={DEFAULT_RAPTOR_PROMPT}
            />
          </div>
        </section>

        {/* Save */}
        <div className="flex justify-end gap-3 pt-4 sticky bottom-0 bg-background/80 backdrop-blur pb-2">
          <Button variant="outline" onClick={() => {
            // Reset all fields to the original settings
            setName(settings.name)
            setDescription(settings.description || '')
            setLanguage(settings.language)
            setEmbeddingModel(settings.embedding_model || '')
            setPagerank(settings.pagerank || 0)
            setTagSets((settings.parser_config?.tag_sets as string[]) || [])
            setParserId(settings.parser_id)
            setParserConfig(settings.parser_config || {})
            setGraphrag((settings.parser_config?.graphrag as GraphRAGConfig) || settings.graphrag || { enabled: false })
            setRaptor((settings.parser_config?.raptor as RAPTORConfig) || settings.raptor || { enabled: false })
          }}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} className="mr-1" />
            {t('common.save')}
          </Button>
        </div>
      </div>

      {/* ===== RIGHT: Built-in Pipeline Introduction ===== */}
      {showIntroPanel && (
        <div className="hidden lg:block w-[340px] shrink-0">
          <div className="sticky top-0 rounded-lg border border-border bg-card p-4 space-y-3 relative">
            <h4 className="text-sm font-medium text-muted-foreground">
              Built-in pipeline introduction
            </h4>
            <button
              type="button"
              onClick={() => setShowIntroPanel(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-3 text-sm">
              <h5 className="font-semibold text-primary">{currentParserDesc?.title}</h5>
              <p className="text-xs text-muted-foreground">{currentParserDesc?.formats}</p>
              <p className="whitespace-pre-line text-muted-foreground leading-relaxed">
                {currentParserDesc?.description}
              </p>

              {/* Pipeline illustration images from RAGFlow */}
              <div className="flex flex-col gap-3 mt-4">
                {(currentParserImages ?? []).map((src, idx) => (
                  <img
                    key={`${parserId}-${idx}`}
                    src={src}
                    alt={`${parserId} illustration ${idx + 1}`}
                    className="w-full rounded border border-border bg-background p-2"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GeneralSettingsForm
