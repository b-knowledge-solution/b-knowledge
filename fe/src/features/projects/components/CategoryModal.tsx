/**
 * @fileoverview Modal form for creating a new document category with RAGFlow dataset config.
 * Uses native useState instead of form libraries.
 * @module features/projects/components/CategoryModal
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// ============================================================================
// Constants
// ============================================================================

/** Available language options for RAGFlow datasets */
const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'English' },
  { label: 'Vietnamese', value: 'Vietnamese' },
  { label: 'Japanese', value: 'Japanese' },
]

/** Available chunk method options for RAGFlow datasets */
const CHUNK_METHOD_OPTIONS = [
  { label: 'General', value: 'naive' },
  { label: 'Book', value: 'book' },
  { label: 'Email', value: 'email' },
  { label: 'Laws', value: 'laws' },
  { label: 'Manual', value: 'manual' },
  { label: 'One', value: 'one' },
  { label: 'Paper', value: 'paper' },
  { label: 'Picture', value: 'picture' },
  { label: 'Presentation', value: 'presentation' },
  { label: 'Q&A', value: 'qa' },
  { label: 'Table', value: 'table' },
  { label: 'Tag', value: 'tag' },
]

/** Available PDF parser options for RAGFlow datasets */
const PDF_PARSER_OPTIONS = [
  { label: 'DeepDOC', value: 'DeepDOC' },
  { label: 'PlainText', value: 'PlainText' },
]

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
  categoryType?: import('../api/projectApi').DocumentCategoryType
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal dialog with a form for creating a new document category.
 * Includes RAGFlow dataset configuration fields.
 *
 * @param {CategoryModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const CategoryModal = ({ open, saving, editMode, embeddingModels, initialData, onOk, onCancel, categoryType }: CategoryModalProps) => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<CategoryFormData>(INITIAL_FORM_DATA)
  const [nameError, setNameError] = useState('')

  // Reset or pre-fill form data when modal opens
  useEffect(() => {
    if (open && initialData) {
      // Edit mode: pre-fill from initial data
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
          },
        },
      })
    } else if (open && !initialData) {
      // Create mode: reset to defaults
      setFormData(INITIAL_FORM_DATA)
    }
    setNameError('')
  }, [open, initialData])

  /**
   * Update a top-level form field.
   * @param field - Field name
   * @param value - New value
   */
  const updateField = <K extends keyof CategoryFormData>(field: K, value: CategoryFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Update a dataset_config field.
   * @param field - Field name within dataset_config
   * @param value - New value
   */
  const updateDatasetConfig = <K extends keyof DatasetConfig>(field: K, value: DatasetConfig[K]) => {
    setFormData((prev) => ({
      ...prev,
      dataset_config: { ...prev.dataset_config, [field]: value },
    }))
  }

  /**
   * Update a parser_config field within dataset_config.
   * Also syncs context window fields when image_context_size changes.
   * @param field - Field name within parser_config
   * @param value - New value
   */
  const updateParserConfig = (field: string, value: unknown) => {
    setFormData((prev) => {
      const newPc = { ...prev.dataset_config.parser_config, [field]: value }
      // Sync all 3 context window fields when image_context_size changes
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

  /**
   * Validate and submit the form.
   */
  const handleOk = () => {
    // Validate required name field
    if (!formData.name.trim()) {
      setNameError(`${t('projectManagement.categories.name')} is required`)
      return
    }
    setNameError('')
    onOk(formData)
  }

  /**
   * Render a tooltip info icon next to a label.
   * @param tip - Tooltip text
   */
  const renderInfoTip = (tip: string) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info size={14} className="ml-1 inline text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs text-xs">{tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  /**
   * Render a slider+number row for numeric range fields.
   * @param min - Minimum value
   * @param max - Maximum value
   * @param value - Current value
   * @param onChange - Change handler
   */
  const renderSliderRow = (min: number, max: number, value: number, onChange: (v: number) => void) => (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="w-full accent-primary"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <Input
        type="number"
        min={min}
        max={max}
        className="w-[70px]"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onCancel() }}>
      <DialogContent className="max-w-[70vw] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {editMode ? t('projectManagement.categories.edit') : t('projectManagement.categories.add')}
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4 overflow-y-auto flex-1 pr-2" style={{ maxHeight: '70vh' }}>
          {/* Category name */}
          <div>
            <Label className="mb-1">
              {t('projectManagement.categories.name')} <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder={t('projectManagement.categories.namePlaceholder')}
              value={formData.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                updateField('name', e.target.value)
                if (nameError) setNameError('')
              }}
              className={nameError ? 'border-red-500' : ''}
            />
            {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
          </div>

          {/* Dataset configuration section */}
          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">
              {t('projectManagement.categories.datasetConfig.title')}
            </span>
            <Separator className="flex-1" />
          </div>
          <span className="text-xs text-muted-foreground block mb-4">
            {t('projectManagement.categories.datasetConfig.description')}
          </span>

          {/* Language */}
          <div>
            <Label className="mb-1">{t('projectManagement.categories.datasetConfig.language')}</Label>
            <Select
              value={formData.dataset_config.language}
              onValueChange={(v: string) => updateDatasetConfig('language', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Embedding model */}
          <div>
            <Label className="mb-1">{t('projectManagement.categories.datasetConfig.embeddingModel')}</Label>
            {embeddingModels && embeddingModels.length > 0 ? (
              <Select
                value={formData.dataset_config.embedding_model || undefined}
                onValueChange={(v: string) => updateDatasetConfig('embedding_model', v || '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('projectManagement.categories.datasetConfig.embeddingModelPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {embeddingModels.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder={t('projectManagement.categories.datasetConfig.embeddingModelPlaceholder')}
                value={formData.dataset_config.embedding_model}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateDatasetConfig('embedding_model', e.target.value)}
              />
            )}
          </div>

          {/* Chunk method */}
          <div>
            <Label className="mb-1">{t('projectManagement.categories.datasetConfig.chunkMethod')}</Label>
            <Select
              value={formData.dataset_config.chunk_method}
              onValueChange={(v: string) => updateDatasetConfig('chunk_method', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHUNK_METHOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Layout Recognize (PDF Parser) */}
          <div>
            <Label className="mb-1">{t('projectManagement.categories.datasetConfig.pdfParser')}</Label>
            <Select
              value={formData.dataset_config.parser_config.layout_recognize}
              onValueChange={(v: string) => updateParserConfig('layout_recognize', v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PDF_PARSER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Chunk token number */}
          <div>
            <Label className="mb-1">{t('projectManagement.categories.datasetConfig.chunkTokenNum')}</Label>
            <Input
              type="number"
              min={1}
              max={2048}
              className="w-full"
              value={formData.dataset_config.parser_config.chunk_token_num}
              onChange={(e) => updateParserConfig('chunk_token_num', Number(e.target.value) || 512)}
            />
          </div>

          {/* Delimiter */}
          <div>
            <Label className="mb-1">{t('projectManagement.categories.datasetConfig.delimiter')}</Label>
            <Input
              value={formData.dataset_config.parser_config.delimiter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateParserConfig('delimiter', e.target.value)}
            />
          </div>

          {/* Child chunk for retrieval */}
          <div>
            <Label className="mb-1">{t('projectManagement.categories.datasetConfig.childChunk')}</Label>
            <div>
              <Switch
                checked={formData.dataset_config.parser_config.child_chunk}
                onCheckedChange={(v: boolean) => updateParserConfig('child_chunk', v)}
              />
            </div>
          </div>

          {/* Child chunk delimiter -- shown only when child_chunk is enabled */}
          {formData.dataset_config.parser_config.child_chunk && (
            <div>
              <Label className="mb-1">{t('projectManagement.categories.datasetConfig.childChunkDelimiter')}</Label>
              <Input
                value={formData.dataset_config.parser_config.child_chunk_delimiter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateParserConfig('child_chunk_delimiter', e.target.value)}
              />
            </div>
          )}

          {/* PageIndex */}
          <div>
            <Label className="mb-1">
              {t('projectManagement.categories.datasetConfig.pageIndex')}
              {renderInfoTip(t('projectManagement.categories.datasetConfig.pageIndexTip'))}
            </Label>
            <div>
              <Switch
                checked={formData.dataset_config.parser_config.page_index}
                onCheckedChange={(v: boolean) => updateParserConfig('page_index', v)}
              />
            </div>
          </div>

          {/* Image & table context window */}
          <div>
            <Label className="mb-1">
              {t('projectManagement.categories.datasetConfig.imageContextSize')}
              {renderInfoTip(t('projectManagement.categories.datasetConfig.imageContextSizeTip'))}
            </Label>
            {renderSliderRow(0, 256, formData.dataset_config.parser_config.image_context_size, (v) => updateParserConfig('image_context_size', v))}
          </div>

          {/* Auto metadata */}
          <div>
            <Label className="mb-1">
              {t('projectManagement.categories.datasetConfig.autoMetadata')}
              {renderInfoTip(t('projectManagement.categories.datasetConfig.autoMetadataTip'))}
            </Label>
            <div>
              <Switch
                checked={formData.dataset_config.parser_config.auto_metadata}
                onCheckedChange={(v: boolean) => updateParserConfig('auto_metadata', v)}
              />
            </div>
          </div>

          {/* Overlapped percent */}
          <div>
            <Label className="mb-1">{t('projectManagement.categories.datasetConfig.overlappedPercent')}</Label>
            {renderSliderRow(0, 100, formData.dataset_config.parser_config.overlapped_percent, (v) => updateParserConfig('overlapped_percent', v))}
          </div>

          {/* Auto-keywords */}
          <div>
            <Label className="mb-1">
              {t('projectManagement.categories.datasetConfig.autoKeyword')}
              {renderInfoTip(t('projectManagement.categories.datasetConfig.autoKeywordTip'))}
            </Label>
            {renderSliderRow(0, 32, formData.dataset_config.parser_config.auto_keywords, (v) => updateParserConfig('auto_keywords', v))}
          </div>

          {/* Auto-questions */}
          <div>
            <Label className="mb-1">
              {t('projectManagement.categories.datasetConfig.autoQuestion')}
              {renderInfoTip(t('projectManagement.categories.datasetConfig.autoQuestionTip'))}
            </Label>
            {renderSliderRow(0, 10, formData.dataset_config.parser_config.auto_questions, (v) => updateParserConfig('auto_questions', v))}
          </div>

          {/* HTML for Excel */}
          <div>
            <Label className="mb-1">
              {t('projectManagement.categories.datasetConfig.html4excel')}
              {renderInfoTip(t('projectManagement.categories.datasetConfig.html4excelTip'))}
            </Label>
            <div>
              <Switch
                checked={formData.dataset_config.parser_config.html4excel}
                onCheckedChange={(v: boolean) => updateParserConfig('html4excel', v)}
              />
            </div>
          </div>
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
