/**
 * @fileoverview Reusable parser-specific ingestion settings fields.
 * Extracted from GeneralSettingsForm to be shared between dataset-level
 * settings and per-document parser change dialog.
 *
 * Renders PDF parser, chunk size, delimiter, toggles, and slider controls
 * based on the selected parser type.
 *
 * @module features/datasets/components/ParserSettingsFields
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, Plus, Trash2, Wand2, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PDF_PARSER_OPTIONS, PARSER_DESCRIPTIONS } from '../types'
import MetadataSchemaBuilder from './MetadataSchemaBuilder'
import type { MetadataSchemaField } from './MetadataSchemaBuilder'
import { datasetApi } from '../api/datasetApi'

// ============================================================================
// Validation constants (sourced from RAGFlow)
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

/** Image & table context window: min 0, max 256, default 0 */
const IMG_TABLE_CTX_MIN = 0
const IMG_TABLE_CTX_MAX = 256
const IMG_TABLE_CTX_DEFAULT = 0

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the ParserSettingsFields component.
 */
interface ParserSettingsFieldsProps {
  /** Currently selected parser ID */
  parserId: string
  /** Current parser configuration values */
  parserConfig: Record<string, unknown>
  /** Callback to update a single configuration key */
  onConfigChange: (key: string, value: unknown) => void
  /** Dataset ID — required for auto-detect field map endpoint */
  datasetId?: string
}

/**
 * @description Represents a single field entry in the structured data field map editor.
 */
interface FieldMapEntry {
  /** Display name for the field */
  name: string
  /** Data type: text, integer, float, date, keyword */
  type: string
  /** Actual OpenSearch field/column name */
  column_name: string
  /** Human-readable description of the field */
  description: string
}

/** Available type options for field map entries */
const FIELD_TYPE_OPTIONS = ['text', 'integer', 'float', 'date', 'keyword'] as const

// ============================================================================
// Sub-component: SliderField
// ============================================================================

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
// Parsers that DON'T support chunking settings
// ============================================================================

/** Parsers where chunk size / delimiter / overlap settings are irrelevant */
const NO_CHUNK_SETTINGS_PARSERS = new Set(['one', 'picture', 'audio', 'email', 'resume', 'table', 'clinical'])

// ============================================================================
// Main Component
// ============================================================================

/**
 * @description Renders parser-specific ingestion configuration fields.
 * Shows different controls depending on which parser is selected:
 *
 * - All parsers except special ones: chunk size, delimiter, overlap, auto-keywords, auto-questions
 * - naive: additionally TOC enhance, child chunk, image & table context
 * - table/resume/picture/audio/email/one: no chunking settings
 *
 * @param {ParserSettingsFieldsProps} props - Component properties
 * @returns {JSX.Element} Rendered parser settings fields
 */
const ParserSettingsFields: React.FC<ParserSettingsFieldsProps> = ({
  parserId,
  parserConfig,
  onConfigChange,
  datasetId,
}) => {
  const { t } = useTranslation()

  // ── Field Map Editor State ──────────────────────────────────────────
  /**
   * Parse existing field_map from parserConfig into FieldMapEntry array.
   * The field_map is stored as Record<name, {type, column_name, description}>.
   */
  const parseFieldMapEntries = (): FieldMapEntry[] => {
    const fm = parserConfig?.field_map
    if (!fm || typeof fm !== 'object') return []
    return Object.entries(fm as Record<string, Record<string, unknown>>).map(([name, val]) => ({
      name,
      type: String(val?.type ?? 'text'),
      column_name: String(val?.column_name ?? name),
      description: String(val?.description ?? ''),
    }))
  }

  const [fieldMapEntries, setFieldMapEntries] = useState<FieldMapEntry[]>(parseFieldMapEntries)
  const [isAutoDetecting, setIsAutoDetecting] = useState(false)

  // Convenience getters with type-safe defaults
  const chunkTokenNum = Number(parserConfig.chunk_token_num ?? CHUNK_TOKEN_DEFAULT)
  const delimiter = String(parserConfig.delimiter ?? '\\n')
  const layoutRecognize = String(parserConfig.layout_recognize ?? 'DeepDOC')
  const overlappedPercent = Number(parserConfig.overlapped_percent ?? OVERLAPPED_DEFAULT)
  const tocExtraction = Boolean(parserConfig.toc_extraction)
  const childChunk = Boolean(parserConfig.child_chunk)
  const childChunkDelimiter = String(parserConfig.child_chunk_delimiter ?? '\\n')
  const imageTableContext = Number(parserConfig.image_table_context ?? IMG_TABLE_CTX_DEFAULT)
  const autoKeywords = Number(parserConfig.auto_keywords ?? AUTO_KEYWORDS_DEFAULT)
  const autoQuestions = Number(parserConfig.auto_questions ?? AUTO_QUESTIONS_DEFAULT)
  const enableMetadata = Boolean(parserConfig.enable_metadata)
  const metadataFields = (parserConfig.metadata ?? []) as MetadataSchemaField[]

  // Whether this parser supports chunking settings
  const showChunkSettings = !NO_CHUNK_SETTINGS_PARSERS.has(parserId)

  // Show field map editor for table parser or when field_map already exists
  const showFieldMap = parserId === 'table' || !!parserConfig?.field_map

  /**
   * Build a field_map object from the entries array and propagate via onConfigChange.
   */
  const syncFieldMap = (entries: FieldMapEntry[]) => {
    if (entries.length === 0) {
      onConfigChange('field_map', undefined)
      return
    }
    const map: Record<string, { type: string; column_name: string; description: string }> = {}
    for (const entry of entries) {
      // Skip entries without a name
      if (!entry.name.trim()) continue
      map[entry.name] = {
        type: entry.type,
        column_name: entry.column_name || entry.name,
        description: entry.description,
      }
    }
    onConfigChange('field_map', map)
  }

  /**
   * Add a new empty field entry to the field map editor.
   */
  const addFieldEntry = () => {
    const updated = [...fieldMapEntries, { name: '', type: 'text', column_name: '', description: '' }]
    setFieldMapEntries(updated)
  }

  /**
   * Remove a field entry by index and sync the field map.
   */
  const removeFieldEntry = (idx: number) => {
    const updated = fieldMapEntries.filter((_, i) => i !== idx)
    setFieldMapEntries(updated)
    syncFieldMap(updated)
  }

  /**
   * Update a single field in an entry by index, then sync the field map.
   */
  const updateFieldEntry = (idx: number, field: keyof FieldMapEntry, value: string) => {
    const updated = fieldMapEntries.map((entry, i) =>
      i === idx ? { ...entry, [field]: value } : entry,
    )
    setFieldMapEntries(updated)
    syncFieldMap(updated)
  }

  /**
   * Auto-detect field map from existing OpenSearch data for this dataset.
   * Calls the backend endpoint and populates the field map editor.
   */
  const handleAutoDetect = async () => {
    if (!datasetId) return
    setIsAutoDetecting(true)
    try {
      const result = await datasetApi.generateFieldMap(datasetId)
      if (result.field_map && Object.keys(result.field_map).length > 0) {
        // Convert server response to FieldMapEntry array
        const entries: FieldMapEntry[] = Object.entries(result.field_map).map(([name, val]) => ({
          name,
          type: String((val as Record<string, unknown>)?.type ?? 'text'),
          column_name: String((val as Record<string, unknown>)?.column_name ?? name),
          description: String((val as Record<string, unknown>)?.description ?? ''),
        }))
        setFieldMapEntries(entries)
        onConfigChange('field_map', result.field_map)
      }
    } catch {
      // Error is handled by the API layer; no-op here
    } finally {
      setIsAutoDetecting(false)
    }
  }

  // Parser description for the info block
  const desc = PARSER_DESCRIPTIONS[parserId]

  return (
    <div className="space-y-4">
      {/* Parser description info block */}
      {desc && (
        <div className="rounded-md bg-muted/50 dark:bg-slate-800/50 p-4 text-sm space-y-4">
          <div className="space-y-1">
            <p className="whitespace-pre-line text-muted-foreground">{desc.description}</p>
            <p className="text-xs text-muted-foreground/70">{desc.formats}</p>
          </div>
          <div className="flex justify-center mt-2 border rounded border-slate-200 dark:border-slate-700/50 p-2 bg-white dark:bg-slate-900 shadow-sm">
            <img 
              src={`/parsers/${parserId}.svg`} 
              alt={`${desc.title} sample formatting`} 
              className="max-w-full h-auto max-h-48 object-contain"
              onError={(e) => {
                // Hide broken images gracefully if a new parser forgets to add its sample
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      )}

      {/* No settings message for special parsers (except table which has field map) */}
      {!showChunkSettings && !showFieldMap && (
        <p className="text-sm text-muted-foreground italic">
          {t('datasets.noParserSettings', 'This parser does not require additional settings.')}
        </p>
      )}

      {/* ================================================================ */}
      {/* Field Map Editor — visible for table parser or when field_map exists */}
      {/* ================================================================ */}
      {showFieldMap && (
        <>
          <Separator className="my-2" />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">
                {t('datasets.fieldMap', 'Structured Data — Field Map')}
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('datasets.fieldMapDesc', 'Define field mappings for SQL-based retrieval on structured datasets')}
              </p>
            </div>
            {/* Auto-detect button — only enabled when datasetId is available */}
            {datasetId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoDetect}
                disabled={isAutoDetecting}
                className="gap-1.5"
              >
                {isAutoDetecting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                {t('datasets.autoDetectFieldMap', 'Auto-detect from data')}
              </Button>
            )}
          </div>

          {/* Field map table editor */}
          {fieldMapEntries.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_100px_1fr_1fr_40px] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                <span>{t('datasets.fieldMapName', 'Display Name')}</span>
                <span>{t('datasets.fieldMapType', 'Type')}</span>
                <span>{t('datasets.fieldMapColumn', 'OpenSearch Field')}</span>
                <span>{t('datasets.fieldMapDescription', 'Description')}</span>
                <span />
              </div>

              {/* Table rows */}
              {fieldMapEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_100px_1fr_1fr_40px] gap-2 px-3 py-1.5 border-t items-center"
                >
                  {/* Display name input */}
                  <Input
                    value={entry.name}
                    onChange={(e) => updateFieldEntry(idx, 'name', e.target.value)}
                    placeholder="field_name"
                    className="h-7 text-sm"
                  />

                  {/* Type dropdown */}
                  <Select
                    value={entry.type}
                    onValueChange={(v: string) => updateFieldEntry(idx, 'type', v)}
                  >
                    <SelectTrigger className="h-7 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* OpenSearch column name input */}
                  <Input
                    value={entry.column_name}
                    onChange={(e) => updateFieldEntry(idx, 'column_name', e.target.value)}
                    placeholder="column_name"
                    className="h-7 text-sm"
                  />

                  {/* Description input */}
                  <Input
                    value={entry.description}
                    onChange={(e) => updateFieldEntry(idx, 'description', e.target.value)}
                    placeholder="Optional description"
                    className="h-7 text-sm"
                  />

                  {/* Remove button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeFieldEntry(idx)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add field button */}
          <Button
            variant="outline"
            size="sm"
            onClick={addFieldEntry}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('datasets.addFieldMapEntry', 'Add Field')}
          </Button>
        </>
      )}

      {/* Chunking settings — only shown for parsers that support them */}
      {showChunkSettings && (
        <>
          {/* PDF Parser (layout recognize) */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm">{t('datasets.pdfParser', 'PDF parser')}</Label>
              <span title="Layout recognition engine for PDF files" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Select
              value={layoutRecognize}
              onValueChange={(v: string) => onConfigChange('layout_recognize', v)}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PDF_PARSER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Recommended chunk size */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm">{t('datasets.chunkSize', 'Chunk size')}</Label>
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
                onChange={(e) => onConfigChange('chunk_token_num', Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <Input
                type="number"
                min={CHUNK_TOKEN_MIN}
                max={CHUNK_TOKEN_MAX}
                value={chunkTokenNum}
                onChange={(e) => onConfigChange('chunk_token_num', Number(e.target.value))}
                onBlur={(e) => onConfigChange('chunk_token_num', Math.max(CHUNK_TOKEN_MIN, Math.min(CHUNK_TOKEN_MAX, Number(e.target.value))))}
                className="w-20 h-8 text-center text-sm"
              />
            </div>
          </div>

          {/* Delimiter */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm">{t('datasets.delimiter', 'Delimiter')}</Label>
              <span title="Characters used to split text into segments" className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Input
              value={delimiter}
              onChange={(e) => onConfigChange('delimiter', e.target.value)}
              placeholder="\\n"
              className="h-8"
            />
          </div>

          {/* Child chunk toggle — shown for naive parser */}
          {parserId === 'naive' && (
            <>
              <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                <Label className="text-sm">{t('datasets.childChunk', 'Child chunk')}</Label>
                <Switch
                  checked={childChunk}
                  onCheckedChange={(checked: boolean) => onConfigChange('child_chunk', checked)}
                />
              </div>

              {/* Child chunk delimiter — shown only when child chunk is enabled */}
              {childChunk && (
                <div className="grid grid-cols-[140px_1fr] items-center gap-3 ml-4 border-l-2 border-primary/20 pl-3">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-sm">{t('datasets.childDelimiter', 'Child delimiter')}</Label>
                    <span title="Delimiter used to split child chunks from parent chunks" className="text-muted-foreground cursor-help">
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <Input
                    value={childChunkDelimiter}
                    onChange={(e) => onConfigChange('child_chunk_delimiter', e.target.value)}
                    placeholder="\\n"
                    className="h-8"
                  />
                </div>
              )}

              {/* TOC enhance */}
              <div className="grid grid-cols-[140px_1fr] items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label className="text-sm">{t('datasets.tocEnhance', 'TOC enhance')}</Label>
                  <span title="Extract table of contents for better chunking" className="text-muted-foreground cursor-help">
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </div>
                <Switch
                  checked={tocExtraction}
                  onCheckedChange={(checked: boolean) => onConfigChange('toc_extraction', checked)}
                />
              </div>

              {/* Image & table context window */}
              <SliderField
                label={t('datasets.imageTableContext', 'Image & table context')}
                value={imageTableContext}
                onChange={(v) => onConfigChange('image_table_context', v)}
                min={IMG_TABLE_CTX_MIN}
                max={IMG_TABLE_CTX_MAX}
                tooltip="Number of surrounding paragraphs to include as context for images/tables"
              />
            </>
          )}

          {/* Overlapped percent */}
          <SliderField
            label={t('datasets.overlappedPercent', 'Overlap (%)')}
            value={overlappedPercent}
            onChange={(v) => onConfigChange('overlapped_percent', v)}
            min={OVERLAPPED_MIN}
            max={OVERLAPPED_MAX}
            tooltip="Percentage of overlap between adjacent chunks"
          />

          {/* ================================================================ */}
          {/* Auto-Extraction Section                                        */}
          {/* ================================================================ */}
          <Separator className="my-2" />
          <Label className="text-sm font-medium">
            {t('datasets.autoExtraction', 'Auto-Extraction')}
          </Label>

          {/* Auto-keywords toggle + count */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm">{t('datasets.autoKeywords', 'Auto-keywords')}</Label>
              <span title={t('datasets.autoKeywordsDesc', 'Automatically extract keywords per chunk')} className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={autoKeywords > 0}
                onCheckedChange={(checked: boolean) =>
                  onConfigChange('auto_keywords', checked ? 5 : 0)
                }
              />
              {/* Count input — only shown when toggle is on */}
              {autoKeywords > 0 && (
                <Input
                  type="number"
                  min={AUTO_KEYWORDS_MIN + 1}
                  max={AUTO_KEYWORDS_MAX}
                  value={autoKeywords}
                  onChange={(e) => onConfigChange('auto_keywords', Number(e.target.value))}
                  onBlur={(e) =>
                    onConfigChange(
                      'auto_keywords',
                      Math.max(1, Math.min(AUTO_KEYWORDS_MAX, Number(e.target.value))),
                    )
                  }
                  className="w-16 h-8 text-center text-sm"
                />
              )}
            </div>
          </div>

          {/* Auto-questions toggle + count */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm">{t('datasets.autoQuestions', 'Auto-questions')}</Label>
              <span title={t('datasets.autoQuestionsDesc', 'Automatically generate questions per chunk')} className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={autoQuestions > 0}
                onCheckedChange={(checked: boolean) =>
                  onConfigChange('auto_questions', checked ? 3 : 0)
                }
              />
              {/* Count input — only shown when toggle is on */}
              {autoQuestions > 0 && (
                <Input
                  type="number"
                  min={AUTO_QUESTIONS_MIN + 1}
                  max={AUTO_QUESTIONS_MAX}
                  value={autoQuestions}
                  onChange={(e) => onConfigChange('auto_questions', Number(e.target.value))}
                  onBlur={(e) =>
                    onConfigChange(
                      'auto_questions',
                      Math.max(1, Math.min(AUTO_QUESTIONS_MAX, Number(e.target.value))),
                    )
                  }
                  className="w-16 h-8 text-center text-sm"
                />
              )}
            </div>
          </div>

          {/* Enable metadata extraction toggle */}
          <div className="grid grid-cols-[140px_1fr] items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label className="text-sm">{t('datasets.enableMetadata', 'Metadata extraction')}</Label>
              <span title={t('datasets.enableMetadataDesc', 'Enable LLM-based metadata extraction using the schema below')} className="text-muted-foreground cursor-help">
                <Info className="w-3.5 h-3.5" />
              </span>
            </div>
            <Switch
              checked={enableMetadata}
              onCheckedChange={(checked: boolean) =>
                onConfigChange('enable_metadata', checked)
              }
            />
          </div>

          {/* MetadataSchemaBuilder — only shown when metadata extraction is enabled */}
          {enableMetadata && (
            <div className="ml-4 border-l-2 border-primary/20 pl-3">
              <MetadataSchemaBuilder
                fields={metadataFields}
                onChange={(fields) => onConfigChange('metadata', fields)}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ParserSettingsFields
