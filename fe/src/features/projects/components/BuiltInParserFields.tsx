/**
 * @fileoverview Shared built-in parser config fields.
 *
 * Extracted from CategoryModal so the same fields can be reused
 * in version create/edit modals to allow per-version overrides.
 *
 * @module features/projects/components/BuiltInParserFields
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// ============================================================================
// Constants
// ============================================================================

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

/** Parser config shape used by BuiltInParserFields */
export interface ParserConfig {
  layout_recognize?: string
  chunk_token_num?: number
  delimiter?: string
  child_chunk?: boolean
  child_chunk_delimiter?: string
  page_index?: boolean
  image_context_size?: number
  auto_metadata?: boolean
  overlapped_percent?: number
  auto_keywords?: number
  auto_questions?: number
  html4excel?: boolean
}

interface BuiltInParserFieldsProps {
  /** Current chunk method value */
  chunkMethod?: string
  /** Handler for chunk method change */
  onChunkMethodChange: (value: string) => void
  /** Current parser config */
  parserConfig: ParserConfig
  /** Handler for parser config field changes */
  onParserConfigChange: (field: string, value: unknown) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Renders all built-in ingestion pipeline fields (chunk method, PDF parser,
 * chunk size, delimiter, child chunk, page index, image context, etc.).
 *
 * @param {BuiltInParserFieldsProps} props - Component props
 * @returns {JSX.Element} The rendered form fields
 */
const BuiltInParserFields = ({
  chunkMethod,
  onChunkMethodChange,
  parserConfig,
  onParserConfigChange,
}: BuiltInParserFieldsProps) => {
  const { t } = useTranslation()
  const chunkMethodOptions = CHUNK_METHOD_OPTIONS.map((option) => ({
    ...option,
    label: t(`projectManagement.categories.datasetConfig.chunkMethods.${option.value}`),
  }))
  const pdfParserOptions = PDF_PARSER_OPTIONS.map((option) => ({
    ...option,
    label: t(`projectManagement.categories.datasetConfig.pdfParsers.${option.value}`),
  }))

  /**
   * Shortcut to update a parser config field.
   * @param field - Field name within parser_config
   * @param value - New value
   */
  const updateField = (field: string, value: unknown) => {
    onParserConfigChange(field, value)
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
    <>
      {/* Chunk method */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.chunkMethod')}
        </Label>
        <Select
          value={chunkMethod || ''}
          onValueChange={onChunkMethodChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('projectManagement.categories.datasetConfig.inheritFromCategory')} />
          </SelectTrigger>
          <SelectContent>
            {chunkMethodOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Layout Recognize (PDF Parser) */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.pdfParser')}
        </Label>
        <Select
          value={parserConfig.layout_recognize || ''}
          onValueChange={(v: string) => updateField('layout_recognize', v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('projectManagement.categories.datasetConfig.inheritFromCategory')} />
          </SelectTrigger>
          <SelectContent>
            {pdfParserOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chunk token number */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.chunkTokenNum')}
        </Label>
        <Input
          type="number"
          min={1}
          max={2048}
          className="w-full"
          placeholder={t('projectManagement.categories.datasetConfig.inheritFromCategory')}
          value={parserConfig.chunk_token_num ?? ''}
          onChange={(e) => updateField('chunk_token_num', e.target.value ? Number(e.target.value) : undefined)}
        />
      </div>

      {/* Delimiter */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.delimiter')}
        </Label>
        <Input
          placeholder="\n"
          value={parserConfig.delimiter ?? ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('delimiter', e.target.value)}
        />
      </div>

      {/* Child chunk for retrieval */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.childChunk')}
        </Label>
        <div>
          <Switch
            checked={parserConfig.child_chunk ?? false}
            onCheckedChange={(v: boolean) => updateField('child_chunk', v)}
          />
        </div>
      </div>

      {/* Child chunk delimiter -- shown only when child_chunk is enabled */}
      {parserConfig.child_chunk && (
        <div className="mb-4">
          <Label className="mb-1">
            {t('projectManagement.categories.datasetConfig.childChunkDelimiter')}
          </Label>
          <Input
            placeholder="\n"
            value={parserConfig.child_chunk_delimiter ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('child_chunk_delimiter', e.target.value)}
          />
        </div>
      )}

      {/* PageIndex */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.pageIndex')}
          {renderInfoTip(t('projectManagement.categories.datasetConfig.pageIndexTip'))}
        </Label>
        <div>
          <Switch
            checked={parserConfig.page_index ?? false}
            onCheckedChange={(v: boolean) => updateField('page_index', v)}
          />
        </div>
      </div>

      {/* Image & table context window */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.imageContextSize')}
          {renderInfoTip(t('projectManagement.categories.datasetConfig.imageContextSizeTip'))}
        </Label>
        {renderSliderRow(0, 256, parserConfig.image_context_size ?? 128, (v) => updateField('image_context_size', v))}
      </div>

      {/* Auto metadata */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.autoMetadata')}
          {renderInfoTip(t('projectManagement.categories.datasetConfig.autoMetadataTip'))}
        </Label>
        <div>
          <Switch
            checked={parserConfig.auto_metadata ?? true}
            onCheckedChange={(v: boolean) => updateField('auto_metadata', v)}
          />
        </div>
      </div>

      {/* Overlapped percent */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.overlappedPercent')}
        </Label>
        {renderSliderRow(0, 100, parserConfig.overlapped_percent ?? 4, (v) => updateField('overlapped_percent', v))}
      </div>

      {/* Auto-keywords */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.autoKeyword')}
          {renderInfoTip(t('projectManagement.categories.datasetConfig.autoKeywordTip'))}
        </Label>
        {renderSliderRow(0, 32, parserConfig.auto_keywords ?? 0, (v) => updateField('auto_keywords', v))}
      </div>

      {/* Auto-questions */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.autoQuestion')}
          {renderInfoTip(t('projectManagement.categories.datasetConfig.autoQuestionTip'))}
        </Label>
        {renderSliderRow(0, 10, parserConfig.auto_questions ?? 0, (v) => updateField('auto_questions', v))}
      </div>

      {/* HTML for Excel */}
      <div className="mb-4">
        <Label className="mb-1">
          {t('projectManagement.categories.datasetConfig.html4excel')}
          {renderInfoTip(t('projectManagement.categories.datasetConfig.html4excelTip'))}
        </Label>
        <div>
          <Switch
            checked={parserConfig.html4excel ?? false}
            onCheckedChange={(v: boolean) => updateField('html4excel', v)}
          />
        </div>
      </div>
    </>
  )
}

export default BuiltInParserFields
