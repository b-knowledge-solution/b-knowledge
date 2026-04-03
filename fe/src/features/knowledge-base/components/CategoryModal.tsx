/**
 * @fileoverview Modal form for creating/editing a document category with RAGFlow dataset config.
 *
 * Redesigned to match GeneralSettingsForm layout with:
 * - Left panel: form fields organized into Basic + Ingestion Pipeline sections
 * - Right panel: parser method SVG illustrations
 * Uses native useState instead of form libraries.
 *
 * @module features/knowledge-base/components/CategoryModal
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

import { useProviders } from '@/features/llm-provider/api/llmProviderQueries'
import { ModelType } from '@/constants'

// ============================================================================
// Pipeline SVG imports (same as GeneralSettingsForm)
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

import {
  PARSER_OPTIONS, PDF_PARSER_OPTIONS, PARSER_DESCRIPTIONS,
} from '@/features/datasets/types'

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
// Constants
// ============================================================================

/** Available language options for RAGFlow datasets */
const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'Vietnamese', value: 'Vietnamese' },
  { label: 'Japanese', value: 'Japanese' },
]

/** Chunk token number: min 1, max 2048, default 512 */
const CHUNK_TOKEN_MIN = 1
const CHUNK_TOKEN_MAX = 2048
const CHUNK_TOKEN_STEP = 32

/** Image & table context window limits */
const IMG_TABLE_CTX_MIN = 0
const IMG_TABLE_CTX_MAX = 256

// ============================================================================
// Types
// ============================================================================

/** Shape of the dataset configuration nested state */
interface DatasetConfig {
  language: string
  embedding_model: string
  chunk_method: string
  parser_config: {
    layout_recognize: string
    chunk_token_num: number
    delimiter: string
    child_chunk: boolean
    child_chunk_delimiter: string
    page_index: boolean
    image_context_size: number
    table_context_size: number
    image_table_context_window: number
    auto_metadata: boolean
    overlapped_percent: number
    auto_keywords: number
    auto_questions: number
    html4excel: boolean
    toc_extraction: boolean
  }
}

/** Full form data shape */
interface CategoryFormData {
  name: string
  dataset_config: DatasetConfig
}

/** Initial form state factory */
const INITIAL_FORM_DATA: CategoryFormData = {
  name: '',
  dataset_config: {
    language: 'English',
    embedding_model: '',
    chunk_method: 'naive',
    parser_config: {
      layout_recognize: 'DeepDOC',
      chunk_token_num: 512,
      delimiter: '\n',
      child_chunk: false,
      child_chunk_delimiter: '\n',
      page_index: false,
      image_context_size: 128,
      table_context_size: 128,
      image_table_context_window: 128,
      auto_metadata: true,
      overlapped_percent: 4,
      auto_keywords: 0,
      auto_questions: 0,
      html4excel: false,
      toc_extraction: false,
    },
  },
}

interface CategoryModalProps {
  /** Whether the modal is visible */
  open: boolean
  /** Whether the submit action is in progress */
  saving: boolean
  /** Whether the modal is in edit mode (vs create mode) */
  editMode?: boolean
  /** Available embedding models from RAGFlow server config */
  embeddingModels?: string[] | undefined
  /** Pre-fill data for edit mode */
  initialData?: { name: string; dataset_config?: Record<string, any> } | null
  /** Callback when the user confirms with form values */
  onOk: (data: CategoryFormData) => void
  /** Callback when the user cancels or closes */
  onCancel: () => void
  /** Category type auto-set from the active tab — hidden from user per D-01 */
  categoryType?: import('../api/knowledgeBaseApi').DocumentCategoryType
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Slider field with range input, numeric input, label, and optional tooltip.
 * Matches GeneralSettingsForm SliderField pattern.
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
  const clamp = (v: number) => Math.max(min, Math.min(max, v))

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        {tooltip && (
          <span title={tooltip} className="text-muted-foreground cursor-help">
            <Info className="w-3 h-3" />
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">{min} – {max}</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary h-1.5"
        />
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={(e) => onChange(clamp(Number(e.target.value)))}
          className="w-14 h-7 text-center text-xs"
        />
      </div>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Modal dialog for creating/editing a document category.
 * Left panel: form fields organized into Basic + Ingestion Pipeline sections (matching GeneralSettingsForm).
 * Right panel: parser method SVG illustrations.
 *
 * @param {CategoryModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const CategoryModal = ({ open, saving, editMode, initialData, onOk, onCancel }: CategoryModalProps) => {
  const { t } = useTranslation()
  const { data: providers } = useProviders()
  const embeddingModels = providers?.filter((p) => p.model_type === ModelType.EMBEDDING) || []
  const [formData, setFormData] = useState<CategoryFormData>(INITIAL_FORM_DATA)
  const [nameError, setNameError] = useState('')
  const [showIntroPanel, setShowIntroPanel] = useState(true)

  // Reset or pre-fill form data when modal opens
  useEffect(() => {
    if (open && initialData) {
      const dc = initialData.dataset_config || {}
      const pc = dc.parser_config || {}
      setFormData({
        name: initialData.name || '',
        dataset_config: {
          language: dc.language || 'English',
          embedding_model: dc.embedding_model || '',
          chunk_method: dc.chunk_method || 'naive',
          parser_config: {
            layout_recognize: pc.layout_recognize || 'DeepDOC',
            chunk_token_num: pc.chunk_token_num ?? 512,
            delimiter: pc.delimiter ?? '\n',
            child_chunk: pc.child_chunk ?? false,
            child_chunk_delimiter: pc.child_chunk_delimiter ?? '\n',
            page_index: pc.page_index ?? false,
            image_context_size: pc.image_context_size ?? 128,
            table_context_size: pc.table_context_size ?? 128,
            image_table_context_window: pc.image_table_context_window ?? 128,
            auto_metadata: pc.auto_metadata ?? true,
            overlapped_percent: pc.overlapped_percent ?? 4,
            auto_keywords: pc.auto_keywords ?? 0,
            auto_questions: pc.auto_questions ?? 0,
            html4excel: pc.html4excel ?? false,
            toc_extraction: pc.toc_extraction ?? false,
          },
        },
      })
    } else if (open && !initialData) {
      setFormData(INITIAL_FORM_DATA)
    }
    setNameError('')
    setShowIntroPanel(true)
  }, [open, initialData])

  /** Update a top-level form field */
  const updateField = <K extends keyof CategoryFormData>(field: K, value: CategoryFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /** Update a dataset_config field */
  const updateDatasetConfig = <K extends keyof DatasetConfig>(field: K, value: DatasetConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      dataset_config: { ...prev.dataset_config, [field]: value },
    }))
  }

  /** Update a parser_config field within dataset_config. Syncs context window fields. */
  const updateParserConfig = (field: string, value: unknown) => {
    setFormData((prev) => {
      const newPc = { ...prev.dataset_config.parser_config, [field]: value }
      if (field === 'image_context_size') {
        newPc.table_context_size = value as number
        newPc.image_table_context_window = value as number
      }
      return {
        ...prev,
        dataset_config: { ...prev.dataset_config, parser_config: newPc },
      }
    })
  }

  /** Validate and submit the form */
  const handleOk = () => {
    if (!formData.name.trim()) {
      setNameError(`${t('knowledgeBase.categories.name')} is required`)
      return
    }
    setNameError('')
    onOk(formData)
  }

  // Current parser description + images for the right panel
  const parserId = formData.dataset_config.chunk_method
  const currentParserDesc = PARSER_DESCRIPTIONS[parserId] || PARSER_DESCRIPTIONS.naive
  const currentParserImages = PARSER_IMAGES[parserId] || [`/parsers/${parserId}.svg`]

  // Convenience getters for parser config
  const pc = formData.dataset_config.parser_config

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-[75vw] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editMode ? t('knowledgeBase.categories.edit') : t('knowledgeBase.categories.add')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 flex-1 overflow-hidden mt-2">
          {/* ===== LEFT: Form Fields ===== */}
          <div className="flex-1 space-y-5 overflow-y-auto pr-2 min-w-0" style={{ maxHeight: '68vh' }}>
            {/* ── Category Name ── */}
            <div>
              <Label className="mb-1">
                {t('knowledgeBase.categories.name')} <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder={t('knowledgeBase.categories.namePlaceholder')}
                value={formData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  updateField('name', e.target.value)
                  if (nameError) setNameError('')
                }}
                className={nameError ? 'border-red-500' : ''}
              />
              {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
            </div>

            {/* ── SECTION: Basic ── */}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground font-medium">Basic</span>
              <Separator className="flex-1" />
            </div>

            {/* Language */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <Label className="text-sm">Language</Label>
              <Select
                value={formData.dataset_config.language}
                onValueChange={(v: string) => updateDatasetConfig('language', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Embedding Model */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <Label className="text-sm text-red-500">*Embedding model</Label>
              <Select
                value={formData.dataset_config.embedding_model || 'default'}
                onValueChange={(v: string) => updateDatasetConfig('embedding_model', v === 'default' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="System default" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">System default</SelectItem>
                  {embeddingModels.map((m) => (
                    <SelectItem key={m.model_name} value={m.model_name}>{m.model_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── SECTION: Ingestion Pipeline ── */}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground font-medium">Ingestion pipeline</span>
              <Separator className="flex-1" />
            </div>

            {/* Parse type radio */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <Label className="text-sm">Parse type</Label>
              <RadioGroup defaultValue="builtin" className="flex items-center gap-6">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="builtin" id="cat-builtin" />
                  <Label htmlFor="cat-builtin" className="font-normal text-sm">Built-in</Label>
                </div>
                <div className="flex items-center space-x-2 opacity-50">
                  <RadioGroupItem value="pipeline" id="cat-pipeline" disabled />
                  <Label htmlFor="cat-pipeline" className="font-normal text-sm text-muted-foreground">Choose pipeline</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Built-in parser */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm text-red-500">*Built-in</Label>
                <span title="Choose the document chunking strategy" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Select value={parserId} onValueChange={(v: string) => updateDatasetConfig('chunk_method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARSER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* PDF Parser */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm">PDF parser</Label>
                <span title="Layout recognition engine for PDF files" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Select
                value={pc.layout_recognize}
                onValueChange={(v: string) => updateParserConfig('layout_recognize', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PDF_PARSER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Chunk size */}
            <SliderField
              label="Recommended chunk size"
              value={pc.chunk_token_num}
              onChange={(v) => updateParserConfig('chunk_token_num', v)}
              min={CHUNK_TOKEN_MIN}
              max={CHUNK_TOKEN_MAX}
              step={CHUNK_TOKEN_STEP}
              tooltip={`Maximum tokens per chunk (${CHUNK_TOKEN_MIN}–${CHUNK_TOKEN_MAX})`}
            />

            {/* Delimiter */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm text-red-500">*Delimiter</Label>
                <span title="Characters used to split text into segments" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Input
                value={pc.delimiter}
                onChange={(e) => updateParserConfig('delimiter', e.target.value)}
                placeholder="\n"
                className="h-8"
              />
            </div>

            {/* Child chunk toggle */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <Label className="text-sm">Child chunk retrieval</Label>
              <Switch
                checked={pc.child_chunk}
                onCheckedChange={(checked: boolean) => updateParserConfig('child_chunk', checked)}
              />
            </div>

            {/* Child chunk delimiter (conditional) */}
            {pc.child_chunk && (
              <div className="grid grid-cols-[140px_1fr] items-center gap-3 ml-4 border-l-2 border-primary/20 pl-3">
                <Label className="text-sm text-red-500">*Child delimiter</Label>
                <Input
                  value={pc.child_chunk_delimiter}
                  onChange={(e) => updateParserConfig('child_chunk_delimiter', e.target.value)}
                  placeholder="\n"
                  className="h-8"
                />
              </div>
            )}

            {/* TOC enhance */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm">TOC enhance</Label>
                <span title="Extract table of contents for better chunking" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Switch
                checked={pc.toc_extraction}
                onCheckedChange={(checked: boolean) => updateParserConfig('toc_extraction', checked)}
              />
            </div>

            {/* Image & table context window */}
            <SliderField
              label="Image & table context window"
              value={pc.image_context_size}
              onChange={(v) => updateParserConfig('image_context_size', v)}
              min={IMG_TABLE_CTX_MIN}
              max={IMG_TABLE_CTX_MAX}
              tooltip="Number of surrounding paragraphs to include as context for images/tables"
            />

            {/* Overlapped percent */}
            <SliderField
              label="Overlapped percent (%)"
              value={pc.overlapped_percent}
              onChange={(v) => updateParserConfig('overlapped_percent', v)}
              min={0}
              max={100}
              tooltip="Percentage of overlap between adjacent chunks"
            />

            {/* Auto-keyword */}
            <SliderField
              label="Auto-keyword"
              value={pc.auto_keywords}
              onChange={(v) => updateParserConfig('auto_keywords', v)}
              min={0}
              max={32}
              tooltip="Automatically extract N keywords per chunk"
            />

            {/* Auto-question */}
            <SliderField
              label="Auto-question"
              value={pc.auto_questions}
              onChange={(v) => updateParserConfig('auto_questions', v)}
              min={0}
              max={10}
              tooltip="Automatically generate N questions per chunk"
            />

            {/* HTML for Excel */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div className="flex items-center gap-1">
                <Label className="text-sm">HTML for Excel</Label>
                <span title="Use HTML rendering for Excel files" className="text-muted-foreground cursor-help">
                  <Info className="w-3 h-3" />
                </span>
              </div>
              <Switch
                checked={pc.html4excel}
                onCheckedChange={(checked: boolean) => updateParserConfig('html4excel', checked)}
              />
            </div>
          </div>

          {/* ===== RIGHT: Pipeline Introduction Panel ===== */}
          {showIntroPanel && (
            <div className="hidden lg:block w-[300px] shrink-0">
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

                <div className="space-y-2 text-sm">
                  <h5 className="font-semibold text-primary">{currentParserDesc?.title}</h5>
                  <p className="text-xs text-muted-foreground">{currentParserDesc?.formats}</p>
                  <p className="whitespace-pre-line text-xs text-muted-foreground leading-relaxed">
                    {currentParserDesc?.description}
                  </p>

                  {/* Pipeline illustration images */}
                  <div className="flex flex-col gap-2 mt-3">
                    {(currentParserImages ?? []).map((src, idx) => (
                      <img
                        key={`${parserId}-${idx}`}
                        src={src}
                        alt={`${parserId} illustration ${idx + 1}`}
                        className="w-full rounded border border-border bg-background p-1.5"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleOk} disabled={saving}>
            {saving ? t('common.saving', 'Saving...') : t('common.ok', 'OK')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default CategoryModal
