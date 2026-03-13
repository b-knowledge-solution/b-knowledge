/**
 * @fileoverview Modal for editing a version's label, page rank, and pipeline config.
 * Shows built-in parser fields (pre-filled from version metadata or category defaults)
 * with a radio toggle matching RAGFlow's UI pattern.
 * Uses native useState instead of Ant Design Form.
 * @module features/projects/components/EditVersionModal
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, InputNumber, Slider, Divider, Typography, Tooltip, Row, Col, Radio, message } from 'antd'
import type { RadioChangeEvent } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import {
  updateCategoryVersion,
  type DocumentCategoryVersion,
} from '../api/projectApi'
import BuiltInParserFields, { type ParserConfig } from './BuiltInParserFields'

const { Text } = Typography

// ============================================================================
// Types
// ============================================================================

/** Form data shape for version editing */
interface EditVersionFormData {
  version_label: string
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
  /** Project ID */
  projectId: string
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
// Component
// ============================================================================

/**
 * Modal for editing a version's label and RAGFlow dataset config.
 *
 * @param {EditVersionModalProps} props - Component props
 * @returns {JSX.Element} The rendered edit version modal
 */
const EditVersionModal = ({
  open,
  version,
  projectId,
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
    pagerank: 0,
    pipeline_id: '',
    chunk_method: 'naive',
    parser_config: {} as ParserConfig,
  })
  const [parseMode, setParseMode] = useState<'builtin' | 'pipeline'>('builtin')
  const [labelError, setLabelError] = useState('')

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
        },
      })
      setLabelError('')
    }
  }, [version, open, categoryConfig])

  /**
   * Update a top-level form field.
   * @param field - Field name
   * @param value - New value
   */
  const updateField = <K extends keyof EditVersionFormData>(field: K, value: EditVersionFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Update a parser_config field.
   * @param field - Parser config field name
   * @param value - New value
   */
  const updateParserConfig = (field: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      parser_config: { ...prev.parser_config, [field]: value },
    }))
  }

  /**
   * Handle form submission -- validates and calls API.
   */
  const handleSubmit = async () => {
    if (!version) return

    // Inline validation
    if (!formData.version_label.trim()) {
      setLabelError(t('projectManagement.versions.labelPlaceholder'))
      return
    }

    if (parseMode === 'pipeline' && !formData.pipeline_id?.trim()) {
      message.error(t('projectManagement.versions.pipelineId') + ' is required')
      return
    }

    setLabelError('')

    try {
      onSavingChange(true)
      const payload: Record<string, any> = {
        version_label: formData.version_label.trim(),
        pagerank: formData.pagerank ?? 0,
      }
      if (parseMode === 'pipeline') {
        if (formData.pipeline_id?.trim()) payload.pipeline_id = formData.pipeline_id.trim()
        if (formData.parse_type != null) payload.parse_type = formData.parse_type
      } else {
        payload.chunk_method = formData.chunk_method
        payload.parser_config = formData.parser_config
      }
      await updateCategoryVersion(projectId, categoryId, version.id, payload)
      message.success(t('projectManagement.versions.updateSuccess'))
      onSaved()
    } catch (err) {
      message.error(String(err))
    } finally {
      onSavingChange(false)
    }
  }

  return (
    <Modal
      title={t('projectManagement.versions.editLabel')}
      open={open}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={saving}
      destroyOnHidden
      width={600}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', overflowX: 'hidden' } }}
    >
      <div className="mt-4 space-y-4">
        {/* Version label */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.versions.label')} <span className="text-red-500">*</span>
          </label>
          <Input
            placeholder={t('projectManagement.versions.labelPlaceholder')}
            value={formData.version_label}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              updateField('version_label', e.target.value)
              if (labelError) setLabelError('')
            }}
            status={labelError ? 'error' : undefined}
          />
          {labelError && <p className="text-red-500 text-xs mt-1">{labelError}</p>}
        </div>

        {/* Page Rank slider */}
        <div>
          <label className="block text-sm font-medium mb-1">
            <span>
              {t('projectManagement.versions.pageRank')}
              <Tooltip title={t('projectManagement.versions.pageRankTip')}>
                <InfoCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
              </Tooltip>
            </span>
          </label>
          <Row gutter={12} align="middle">
            <Col flex="auto">
              <Slider
                min={0}
                max={100}
                value={formData.pagerank}
                onChange={(v: number) => updateField('pagerank', v)}
              />
            </Col>
            <Col>
              <InputNumber
                min={0}
                max={100}
                style={{ width: 70 }}
                value={formData.pagerank}
                onChange={(v: number | null) => updateField('pagerank', v ?? 0)}
              />
            </Col>
          </Row>
        </div>

        {/* Ingestion pipeline section */}
        <Divider orientation="left" plain>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t('projectManagement.versions.pipelineSection')}
          </Text>
        </Divider>

        {/* Parse type radio toggle */}
        <div>
          <label className="block text-sm font-medium mb-1">
            {t('projectManagement.versions.parseType')}
          </label>
          <Radio.Group
            value={parseMode}
            onChange={(e: RadioChangeEvent) => {
              setParseMode(e.target.value)
              if (e.target.value === 'builtin') {
                updateField('pipeline_id', '')
                updateField('parse_type', undefined)
              }
            }}
          >
            <Radio value="builtin">{t('projectManagement.versions.parseTypeBuiltIn')}</Radio>
            <Radio value="pipeline">{t('projectManagement.versions.parseTypeChoosePipeline')}</Radio>
          </Radio.Group>
        </div>

        {/* Built-in fields -- pre-filled, user can override */}
        {parseMode === 'builtin' && (
          <>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              {t('projectManagement.versions.builtInHint')}
            </Text>
            <BuiltInParserFields
              chunkMethod={formData.chunk_method}
              onChunkMethodChange={(v: string) => updateField('chunk_method', v)}
              parserConfig={formData.parser_config}
              onParserConfigChange={updateParserConfig}
            />
          </>
        )}

        {/* Pipeline fields */}
        {parseMode === 'pipeline' && (
          <>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              {t('projectManagement.versions.pipelineSectionTip')}
            </Text>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                {t('projectManagement.versions.pipelineId')} <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder={t('projectManagement.versions.pipelineIdPlaceholder')}
                value={formData.pipeline_id}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('pipeline_id', e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                {t('projectManagement.versions.parseTypeNum')}
              </label>
              <InputNumber
                min={1}
                style={{ width: '100%' }}
                placeholder={t('projectManagement.versions.parseTypePlaceholder') || ''}
                value={formData.parse_type}
                onChange={(v: number | null) => updateField('parse_type', v ?? undefined)}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

export default EditVersionModal
