/**
 * @fileoverview Modal form for creating a new document category with RAGFlow dataset config.
 * Uses native useState instead of Ant Design Form.
 * @module features/projects/components/CategoryModal
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, Select, InputNumber, Switch, Slider, Divider, Typography, Tooltip, Row, Col } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'

const { Text } = Typography

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
const CategoryModal = ({ open, saving, editMode, embeddingModels, initialData, onOk, onCancel }: CategoryModalProps) => {
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

  return (
    <Modal
      title={editMode ? t('projectManagement.categories.edit') : t('projectManagement.categories.add')}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={saving}
      destroyOnHidden
      width="70vw"
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden' } }}
    >
      <div className="mt-4 space-y-4">
        {/* Category name */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.name')} <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder={t('projectManagement.categories.namePlaceholder')}
            value={formData.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              updateField('name', e.target.value)
              if (nameError) setNameError('')
            }}
            status={nameError ? 'error' : undefined}
          />
          {nameError && <p className="text-red-500 text-xs mt-1">{nameError}</p>}
        </div>

        {/* Dataset configuration section */}
        <Divider orientation="left" plain>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('projectManagement.categories.datasetConfig.title')}
          </Text>
        </Divider>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
          {t('projectManagement.categories.datasetConfig.description')}
        </Text>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.language')}
          </label>
          <Select
            value={formData.dataset_config.language}
            onChange={(v: string) => updateDatasetConfig('language', v)}
            options={LANGUAGE_OPTIONS}
            className="w-full"
          />
        </div>

        {/* Embedding model */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.embeddingModel')}
          </label>
          {embeddingModels && embeddingModels.length > 0 ? (
            <Select
              allowClear
              showSearch
              placeholder={t('projectManagement.categories.datasetConfig.embeddingModelPlaceholder')}
              options={embeddingModels.map((m) => ({ label: m, value: m }))}
              value={formData.dataset_config.embedding_model || undefined}
              onChange={(v: string) => updateDatasetConfig('embedding_model', v || '')}
              className="w-full"
            />
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
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.chunkMethod')}
          </label>
          <Select
            value={formData.dataset_config.chunk_method}
            onChange={(v: string) => updateDatasetConfig('chunk_method', v)}
            options={CHUNK_METHOD_OPTIONS}
            className="w-full"
          />
        </div>

        {/* Layout Recognize (PDF Parser) */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.pdfParser')}
          </label>
          <Select
            value={formData.dataset_config.parser_config.layout_recognize}
            onChange={(v: string) => updateParserConfig('layout_recognize', v)}
            options={PDF_PARSER_OPTIONS}
            className="w-full"
          />
        </div>

        {/* Chunk token number */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.chunkTokenNum')}
          </label>
          <InputNumber
            min={1}
            max={2048}
            style={{ width: '100%' }}
            value={formData.dataset_config.parser_config.chunk_token_num}
            onChange={(v: number | null) => updateParserConfig('chunk_token_num', v ?? 512)}
          />
        </div>

        {/* Delimiter */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.delimiter')}
          </label>
          <Input
            value={formData.dataset_config.parser_config.delimiter}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateParserConfig('delimiter', e.target.value)}
          />
        </div>

        {/* Child chunk for retrieval */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.childChunk')}
          </label>
          <Switch
            checked={formData.dataset_config.parser_config.child_chunk}
            onChange={(v: boolean) => updateParserConfig('child_chunk', v)}
          />
        </div>

        {/* Child chunk delimiter -- shown only when child_chunk is enabled */}
        {formData.dataset_config.parser_config.child_chunk && (
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('projectManagement.categories.datasetConfig.childChunkDelimiter')}
            </label>
            <Input
              value={formData.dataset_config.parser_config.child_chunk_delimiter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateParserConfig('child_chunk_delimiter', e.target.value)}
            />
          </div>
        )}

        {/* PageIndex */}
        <div>
          <label className="block text-sm font-medium mb-1">
            <span>
              {t('projectManagement.categories.datasetConfig.pageIndex')}
              <Tooltip title={t('projectManagement.categories.datasetConfig.pageIndexTip')}>
                <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
              </Tooltip>
            </span>
          </label>
          <Switch
            checked={formData.dataset_config.parser_config.page_index}
            onChange={(v: boolean) => updateParserConfig('page_index', v)}
          />
        </div>

        {/* Image & table context window */}
        <div>
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
                value={formData.dataset_config.parser_config.image_context_size}
                onChange={(v: number) => updateParserConfig('image_context_size', v)}
              />
            </Col>
            <Col>
              <InputNumber
                min={0}
                max={256}
                style={{ width: 70 }}
                value={formData.dataset_config.parser_config.image_context_size}
                onChange={(v: number | null) => updateParserConfig('image_context_size', v ?? 0)}
              />
            </Col>
          </Row>
        </div>

        {/* Auto metadata */}
        <div>
          <label className="block text-sm font-medium mb-1">
            <span>
              {t('projectManagement.categories.datasetConfig.autoMetadata')}
              <Tooltip title={t('projectManagement.categories.datasetConfig.autoMetadataTip')}>
                <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
              </Tooltip>
            </span>
          </label>
          <Switch
            checked={formData.dataset_config.parser_config.auto_metadata}
            onChange={(v: boolean) => updateParserConfig('auto_metadata', v)}
          />
        </div>

        {/* Overlapped percent */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.categories.datasetConfig.overlappedPercent')}
          </label>
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Slider
                min={0}
                max={100}
                value={formData.dataset_config.parser_config.overlapped_percent}
                onChange={(v: number) => updateParserConfig('overlapped_percent', v)}
              />
            </Col>
            <Col>
              <InputNumber
                min={0}
                max={100}
                style={{ width: 70 }}
                value={formData.dataset_config.parser_config.overlapped_percent}
                onChange={(v: number | null) => updateParserConfig('overlapped_percent', v ?? 0)}
              />
            </Col>
          </Row>
        </div>

        {/* Auto-keywords */}
        <div>
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
                value={formData.dataset_config.parser_config.auto_keywords}
                onChange={(v: number) => updateParserConfig('auto_keywords', v)}
              />
            </Col>
            <Col>
              <InputNumber
                min={0}
                max={32}
                style={{ width: 70 }}
                value={formData.dataset_config.parser_config.auto_keywords}
                onChange={(v: number | null) => updateParserConfig('auto_keywords', v ?? 0)}
              />
            </Col>
          </Row>
        </div>

        {/* Auto-questions */}
        <div>
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
                value={formData.dataset_config.parser_config.auto_questions}
                onChange={(v: number) => updateParserConfig('auto_questions', v)}
              />
            </Col>
            <Col>
              <InputNumber
                min={0}
                max={10}
                style={{ width: 70 }}
                value={formData.dataset_config.parser_config.auto_questions}
                onChange={(v: number | null) => updateParserConfig('auto_questions', v ?? 0)}
              />
            </Col>
          </Row>
        </div>

        {/* HTML for Excel */}
        <div>
          <label className="block text-sm font-medium mb-1">
            <span>
              {t('projectManagement.categories.datasetConfig.html4excel')}
              <Tooltip title={t('projectManagement.categories.datasetConfig.html4excelTip')}>
                <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
              </Tooltip>
            </span>
          </label>
          <Switch
            checked={formData.dataset_config.parser_config.html4excel}
            onChange={(v: boolean) => updateParserConfig('html4excel', v)}
          />
        </div>
      </div>
    </Modal>
  )
}

export default CategoryModal
