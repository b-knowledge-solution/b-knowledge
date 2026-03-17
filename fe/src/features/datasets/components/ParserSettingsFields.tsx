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

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PDF_PARSER_OPTIONS, PARSER_DESCRIPTIONS } from '../types'

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
}

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
const NO_CHUNK_SETTINGS_PARSERS = new Set(['one', 'picture', 'audio', 'email', 'resume', 'table'])

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
}) => {
  const { t } = useTranslation()

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

  // Whether this parser supports chunking settings
  const showChunkSettings = !NO_CHUNK_SETTINGS_PARSERS.has(parserId)

  // Parser description for the info block
  const desc = PARSER_DESCRIPTIONS[parserId]

  return (
    <div className="space-y-4">
      {/* Parser description info block */}
      {desc && (
        <div className="rounded-md bg-muted/50 dark:bg-slate-800/50 p-3 text-sm space-y-1">
          <p className="whitespace-pre-line text-muted-foreground">{desc.description}</p>
          <p className="text-xs text-muted-foreground/70">{desc.formats}</p>
        </div>
      )}

      {/* No settings message for special parsers */}
      {!showChunkSettings && (
        <p className="text-sm text-muted-foreground italic">
          {t('datasets.noParserSettings', 'This parser does not require additional settings.')}
        </p>
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

          {/* Auto-keyword */}
          <SliderField
            label={t('datasets.autoKeyword', 'Auto-keyword')}
            value={autoKeywords}
            onChange={(v) => onConfigChange('auto_keywords', v)}
            min={AUTO_KEYWORDS_MIN}
            max={AUTO_KEYWORDS_MAX}
            tooltip="Automatically extract N keywords per chunk (recommended: 3–5)"
          />

          {/* Auto-question */}
          <SliderField
            label={t('datasets.autoQuestion', 'Auto-question')}
            value={autoQuestions}
            onChange={(v) => onConfigChange('auto_questions', v)}
            min={AUTO_QUESTIONS_MIN}
            max={AUTO_QUESTIONS_MAX}
            tooltip="Automatically generate N questions per chunk (recommended: 1–2)"
          />
        </>
      )}
    </div>
  )
}

export default ParserSettingsFields
