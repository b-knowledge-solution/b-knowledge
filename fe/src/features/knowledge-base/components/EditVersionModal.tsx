/**
 * @fileoverview Modal for editing a version's label, language, and pipeline config.
 *
 * Redesigned to match GeneralSettingsForm/CategoryModal layout with:
 * - Left panel: form fields (version label, language, ingestion pipeline config)
 * - Right panel: parser method SVG illustrations
 * - SliderField components for numeric settings
 * Uses native useState instead of form libraries.
 *
 * @module features/knowledge-base/components/EditVersionModal
 */

import { useEffect, useState } from 'react'
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
import { globalMessage } from '@/app/App'
import {
  updateCategoryVersion,
  type DocumentCategoryVersion,
} from '../api/knowledgeBaseApi'

// ============================================================================
// Pipeline SVG imports (same as GeneralSettingsForm/CategoryModal)
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

/** Available language options for document versions */
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

/** Parser config shape */
interface ParserConfig {
  layout_recognize: string
  chunk_token_num: number
  delimiter: string
  child_chunk: boolean
  child_chunk_delimiter: string
  page_index: boolean
  image_context_size: number
  auto_metadata: boolean
  overlapped_percent: number
  auto_keywords: number
  auto_questions: number
  html4excel: boolean
  toc_extraction: boolean
}

/** Form data shape for version editing */
interface EditVersionFormData {
  version_label: string
  language: string
  pagerank: number
  pipeline_id: string
  parse_type?: number
  chunk_method: string
  parser_config: ParserConfig
}

interface EditVersionModalProps {
  /** Whether the modal is visible */
  open: boolean
  /** The version being edited */
  version: DocumentCategoryVersion | null
  /** Knowledge Base ID */
  knowledgeBaseId: string
  /** Category ID */
  categoryId: string
  /** Whether a save operation is in progress */
  saving: boolean
  /** Category-level dataset_config (fallback for pre-filling built-in fields) */
  categoryConfig?: Record<string, any> | undefined
  /** Callback to toggle saving state */
  onSavingChange: (saving: boolean) => void
  /** Callback after successful save */
  onSaved: () => void
  /** Callback to close the modal */
  onCancel: () => void
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
 * @description Modal for editing a version's label, language, and RAGFlow dataset config.
 * Left panel: form fields (version label, language, ingestion pipeline).
 * Right panel: parser method SVG illustrations.
 *
 * @param {EditVersionModalProps} props - Component props
 * @returns {JSX.Element} The rendered edit version modal
 */
const EditVersionModal = ({
  open,
  version,
  knowledgeBaseId,
  categoryId,
  saving,
  categoryConfig,
  onSavingChange,
  onSaved,
  onCancel,
}: EditVersionModalProps) => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<EditVersionFormData>({
    version_label: '',
    language: 'English',
    pagerank: 0,
    pipeline_id: '',
    chunk_method: 'naive',
    parser_config: {} as ParserConfig,
  })
  const [parseMode, setParseMode] = useState<'builtin' | 'pipeline'>('builtin')
  const [labelError, setLabelError] = useState('')
  const [showIntroPanel, setShowIntroPanel] = useState(true)

  // Pre-fill form when version changes
  useEffect(() => {
    if (version && open) {
      const meta = (version.metadata || {}) as Record<string, any>
      const hasPipeline = !!(meta.pipeline_id)
      setParseMode(hasPipeline ? 'pipeline' : 'builtin')

      // Use version metadata first, fall back to category config
      const catPc = (categoryConfig?.parser_config || {}) as Record<string, any>
      const verPc = (meta.parser_config || {}) as Record<string, any>

      // RAGFlow stores overlapped_percent as decimal (0.04 = 4%), UI expects integer
      const rawOverlap = verPc.overlapped_percent ?? catPc.overlapped_percent ?? 4
      const overlapped_percent = typeof rawOverlap === 'number' && rawOverlap > 0 && rawOverlap < 1
        ? Math.round(rawOverlap * 100)
        : rawOverlap

      setFormData({
        version_label: version.version_label,
        language: meta.language || categoryConfig?.language || 'English',
        pagerank: meta.pagerank ?? 0,
        pipeline_id: meta.pipeline_id ?? '',
        parse_type: meta.parse_type ?? undefined,
        chunk_method: meta.chunk_method || categoryConfig?.chunk_method || 'naive',
        parser_config: {
          layout_recognize: verPc.layout_recognize || catPc.layout_recognize || 'DeepDOC',
          chunk_token_num: verPc.chunk_token_num ?? catPc.chunk_token_num ?? 512,
          delimiter: verPc.delimiter ?? catPc.delimiter ?? '\\n',
          child_chunk: verPc.child_chunk ?? catPc.child_chunk ?? false,
          child_chunk_delimiter: verPc.child_chunk_delimiter ?? catPc.child_chunk_delimiter ?? '\\n',
          page_index: verPc.page_index ?? catPc.page_index ?? false,
          image_context_size: verPc.image_context_size ?? catPc.image_context_size ?? 128,
          auto_metadata: verPc.auto_metadata ?? catPc.auto_metadata ?? true,
          overlapped_percent,
          auto_keywords: verPc.auto_keywords ?? catPc.auto_keywords ?? 0,
          auto_questions: verPc.auto_questions ?? catPc.auto_questions ?? 0,
          html4excel: verPc.html4excel ?? catPc.html4excel ?? false,
          toc_extraction: verPc.toc_extraction ?? catPc.toc_extraction ?? false,
        },
      })
      setLabelError('')
      setShowIntroPanel(true)
    }
  }, [version, open, categoryConfig])

  /** Update a top-level form field */
  const updateField = <K extends keyof EditVersionFormData>(field: K, value: EditVersionFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /** Update a parser_config field */
  const updateParserConfig = (field: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      parser_config: { ...prev.parser_config, [field]: value },
    }))
  }

  /** Handle form submission -- validates and calls API */
  const handleSubmit = async () => {
    if (!version) return

    // Inline validation
    if (!formData.version_label.trim()) {
      setLabelError(t('projectManagement.versions.labelPlaceholder'))
      return
    }

    if (parseMode === 'pipeline' && !formData.pipeline_id?.trim()) {
      globalMessage.error(t('projectManagement.versions.pipelineId') + ' is required')
      return
    }

    setLabelError('')

    try {
      onSavingChange(true)
      const payload: Record<string, any> = {
        version_label: formData.version_label.trim(),
        language: formData.language,
        pagerank: formData.pagerank ?? 0,
      }
      if (parseMode === 'pipeline') {
        if (formData.pipeline_id?.trim()) payload.pipeline_id = formData.pipeline_id.trim()
        if (formData.parse_type != null) payload.parse_type = formData.parse_type
      } else {
        payload.chunk_method = formData.chunk_method
        payload.parser_config = formData.parser_config
      }
      await updateCategoryVersion(knowledgeBaseId, categoryId, version.id, payload)
      globalMessage.success(t('projectManagement.versions.updateSuccess'))
      onSaved()
    } catch (err) {
      globalMessage.error(String(err))
    } finally {
      onSavingChange(false)
    }
  }

  // Current parser description + images for the right panel
  const parserId = formData.chunk_method
  const currentParserDesc = PARSER_DESCRIPTIONS[parserId] || PARSER_DESCRIPTIONS.naive
  const currentParserImages = PARSER_IMAGES[parserId] || [`/parsers/${parserId}.svg`]

  // Convenience getter for parser config
  const pc = formData.parser_config

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-[75vw] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('projectManagement.versions.editLabel')}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 flex-1 overflow-hidden mt-2">
          {/* ===== LEFT: Form Fields ===== */}
          <div className="flex-1 space-y-5 overflow-y-auto pr-2 min-w-0" style={{ maxHeight: '68vh' }}>
            {/* ── Version Label ── */}
            <div>
              <Label className="mb-1">
                {t('projectManagement.versions.label')} <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder={t('projectManagement.versions.labelPlaceholder')}
                value={formData.version_label}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  updateField('version_label', e.target.value)
                  if (labelError) setLabelError('')
                }}
                className={labelError ? 'border-red-500' : ''}
              />
              {labelError && <p className="text-red-500 text-xs mt-1">{labelError}</p>}
            </div>

            {/* ── Language ── */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <Label className="text-sm">{t('projectManagement.categories.datasetConfig.language')}</Label>
              <Select
                value={formData.language}
                onValueChange={(v: string) => updateField('language', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Page Rank ── */}
            <SliderField
              label={t('projectManagement.versions.pageRank')}
              value={formData.pagerank}
              onChange={(v) => updateField('pagerank', v)}
              min={0}
              max={100}
              tooltip={t('projectManagement.versions.pageRankTip') || ''}
            />

            {/* ── SECTION: Ingestion Pipeline ── */}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground font-medium">
                {t('projectManagement.versions.pipelineSection')}
              </span>
              <Separator className="flex-1" />
            </div>

            {/* Parse type radio */}
            <div className="grid grid-cols-[140px_1fr] items-center gap-3">
              <Label className="text-sm">{t('projectManagement.versions.parseType')}</Label>
              <RadioGroup
                value={parseMode}
                onValueChange={(value: string) => {
                  setParseMode(value as 'builtin' | 'pipeline')
                  if (value === 'builtin') {
                    updateField('pipeline_id', '')
                    updateField('parse_type', undefined)
                  }
                }}
                className="flex items-center gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="builtin" id="edit-ver-builtin" />
                  <Label htmlFor="edit-ver-builtin" className="font-normal text-sm">{t('projectManagement.versions.parseTypeBuiltIn')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pipeline" id="edit-ver-pipeline" />
                  <Label htmlFor="edit-ver-pipeline" className="font-normal text-sm">{t('projectManagement.versions.parseTypeChoosePipeline')}</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Built-in parser fields */}
            {parseMode === 'builtin' && (
              <>
                {/* Built-in parser selector */}
                <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Label className="text-sm text-red-500">*Built-in</Label>
                    <span title="Choose the document chunking strategy" className="text-muted-foreground cursor-help">
                      <Info className="w-3 h-3" />
                    </span>
                  </div>
                  <Select value={parserId} onValueChange={(v: string) => updateField('chunk_method', v)}>
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
              </>
            )}

            {/* Pipeline fields -- only visible when "Choose pipeline" is selected */}
            {parseMode === 'pipeline' && (
              <>
                <p className="text-xs text-muted-foreground mb-4">
                  {t('projectManagement.versions.pipelineSectionTip')}
                </p>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">
                    {t('projectManagement.versions.pipelineId')} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    placeholder={t('projectManagement.versions.pipelineIdPlaceholder')}
                    value={formData.pipeline_id}
                    onChange={(e) => updateField('pipeline_id', e.target.value)}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">
                    {t('projectManagement.versions.parseTypeNum')}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    className="w-full"
                    placeholder={t('projectManagement.versions.parseTypePlaceholder') || ''}
                    value={formData.parse_type ?? ''}
                    onChange={(e) => updateField('parse_type', e.target.value ? Number(e.target.value) : undefined)}
                  />
                </div>
              </>
            )}
          </div>

          {/* ===== RIGHT: Pipeline Introduction Panel ===== */}
          {showIntroPanel && parseMode === 'builtin' && (
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
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default EditVersionModal
