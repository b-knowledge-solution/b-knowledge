/**
 * @fileoverview Shared built-in parser config fields.
 *
 * Extracted from CategoryModal so the same fields can be reused
 * in version create/edit modals to allow per-version overrides.
 *
 * @module features/projects/components/BuiltInParserFields
 */

import { useTranslation } from 'react-i18next'
import { Select, Input, InputNumber, Switch, Slider, Tooltip, Row, Col } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'

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

  /**
   * Shortcut to update a parser config field.
   * @param field - Field name within parser_config
   * @param value - New value
   */
  const updateField = (field: string, value: unknown) => {
    onParserConfigChange(field, value)
  }

  return (
    <>
      {/* Chunk method */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          {t('projectManagement.categories.datasetConfig.chunkMethod')}
        </label>
        <Select
          value={chunkMethod}
          onChange={onChunkMethodChange}
          options={CHUNK_METHOD_OPTIONS}
          allowClear
          placeholder="Inherit from category"
          className="w-full"
        />
      </div>

      {/* Layout Recognize (PDF Parser) */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          {t('projectManagement.categories.datasetConfig.pdfParser')}
        </label>
        <Select
          value={parserConfig.layout_recognize}
          onChange={(v: string) => updateField('layout_recognize', v)}
          options={PDF_PARSER_OPTIONS}
          allowClear
          placeholder="Inherit from category"
          className="w-full"
        />
      </div>

      {/* Chunk token number */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          {t('projectManagement.categories.datasetConfig.chunkTokenNum')}
        </label>
        <InputNumber
          min={1}
          max={2048}
          style={{ width: '100%' }}
          placeholder="Inherit from category"
          value={parserConfig.chunk_token_num}
          onChange={(v: number | null) => updateField('chunk_token_num', v ?? undefined)}
        />
      </div>

      {/* Delimiter */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          {t('projectManagement.categories.datasetConfig.delimiter')}
        </label>
        <Input
          placeholder="\n"
          value={parserConfig.delimiter}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('delimiter', e.target.value)}
        />
      </div>

      {/* Child chunk for retrieval */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          {t('projectManagement.categories.datasetConfig.childChunk')}
        </label>
        <Switch
          checked={parserConfig.child_chunk ?? false}
          onChange={(v: boolean) => updateField('child_chunk', v)}
        />
      </div>

      {/* Child chunk delimiter -- shown only when child_chunk is enabled */}
      {parserConfig.child_chunk && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.childChunkDelimiter')}
          </label>
          <Input
            placeholder="\n"
            value={parserConfig.child_chunk_delimiter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('child_chunk_delimiter', e.target.value)}
          />
        </div>
      )}

      {/* PageIndex */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          <span>
            {t('projectManagement.categories.datasetConfig.pageIndex')}
            <Tooltip title={t('projectManagement.categories.datasetConfig.pageIndexTip')}>
              <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
            </Tooltip>
          </span>
        </label>
        <Switch
          checked={parserConfig.page_index ?? false}
          onChange={(v: boolean) => updateField('page_index', v)}
        />
      </div>

      {/* Image & table context window */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          <span>
            {t('projectManagement.categories.datasetConfig.imageContextSize')}
            <Tooltip title={t('projectManagement.categories.datasetConfig.imageContextSizeTip')}>
              <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
            </Tooltip>
          </span>
        </label>
        <Row gutter={12} align="middle">
          <Col flex="auto">
            <Slider
              min={0}
              max={256}
              value={parserConfig.image_context_size ?? 128}
              onChange={(v: number) => updateField('image_context_size', v)}
            />
          </Col>
          <Col>
            <InputNumber
              min={0}
              max={256}
              style={{ width: 70 }}
              value={parserConfig.image_context_size ?? 128}
              onChange={(v: number | null) => updateField('image_context_size', v ?? 0)}
            />
          </Col>
        </Row>
      </div>

      {/* Auto metadata */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          <span>
            {t('projectManagement.categories.datasetConfig.autoMetadata')}
            <Tooltip title={t('projectManagement.categories.datasetConfig.autoMetadataTip')}>
              <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
            </Tooltip>
          </span>
        </label>
        <Switch
          checked={parserConfig.auto_metadata ?? true}
          onChange={(v: boolean) => updateField('auto_metadata', v)}
        />
      </div>

      {/* Overlapped percent */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          {t('projectManagement.categories.datasetConfig.overlappedPercent')}
        </label>
        <Row gutter={12} align="middle">
          <Col flex="auto">
            <Slider
              min={0}
              max={100}
              value={parserConfig.overlapped_percent ?? 4}
              onChange={(v: number) => updateField('overlapped_percent', v)}
            />
          </Col>
          <Col>
            <InputNumber
              min={0}
              max={100}
              style={{ width: 70 }}
              value={parserConfig.overlapped_percent ?? 4}
              onChange={(v: number | null) => updateField('overlapped_percent', v ?? 0)}
            />
          </Col>
        </Row>
      </div>

      {/* Auto-keywords */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          <span>
            {t('projectManagement.categories.datasetConfig.autoKeyword')}
            <Tooltip title={t('projectManagement.categories.datasetConfig.autoKeywordTip')}>
              <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
            </Tooltip>
          </span>
        </label>
        <Row gutter={12} align="middle">
          <Col flex="auto">
            <Slider
              min={0}
              max={32}
              value={parserConfig.auto_keywords ?? 0}
              onChange={(v: number) => updateField('auto_keywords', v)}
            />
          </Col>
          <Col>
            <InputNumber
              min={0}
              max={32}
              style={{ width: 70 }}
              value={parserConfig.auto_keywords ?? 0}
              onChange={(v: number | null) => updateField('auto_keywords', v ?? 0)}
            />
          </Col>
        </Row>
      </div>

      {/* Auto-questions */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          <span>
            {t('projectManagement.categories.datasetConfig.autoQuestion')}
            <Tooltip title={t('projectManagement.categories.datasetConfig.autoQuestionTip')}>
              <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
            </Tooltip>
          </span>
        </label>
        <Row gutter={12} align="middle">
          <Col flex="auto">
            <Slider
              min={0}
              max={10}
              value={parserConfig.auto_questions ?? 0}
              onChange={(v: number) => updateField('auto_questions', v)}
            />
          </Col>
          <Col>
            <InputNumber
              min={0}
              max={10}
              style={{ width: 70 }}
              value={parserConfig.auto_questions ?? 0}
              onChange={(v: number | null) => updateField('auto_questions', v ?? 0)}
            />
          </Col>
        </Row>
      </div>

      {/* HTML for Excel */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          <span>
            {t('projectManagement.categories.datasetConfig.html4excel')}
            <Tooltip title={t('projectManagement.categories.datasetConfig.html4excelTip')}>
              <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
            </Tooltip>
          </span>
        </label>
        <Switch
          checked={parserConfig.html4excel ?? false}
          onChange={(v: boolean) => updateField('html4excel', v)}
        />
      </div>
    </>
  )
}

export default BuiltInParserFields
