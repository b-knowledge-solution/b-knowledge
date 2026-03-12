/**
 * @fileoverview Modal form for creating a new category version.
 * Includes page rank slider and ingestion pipeline toggle (Built-in vs Choose pipeline).
 * When "Built-in" is selected, shows parser config fields pre-filled from category defaults.
 * Uses native useState instead of Ant Design Form.
 * @module features/projects/components/VersionModal
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal, Input, InputNumber, Slider, Divider, Typography, Tooltip, Row, Col, Radio } from 'antd'
import type { RadioChangeEvent } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import BuiltInParserFields, { type ParserConfig } from './BuiltInParserFields'

const { Text } = Typography

// ============================================================================
// Types
// ============================================================================

/** Form data shape for version creation */
export interface VersionFormData {
  version_label: string
  pagerank: number
  pipeline_id?: string
  parse_type?: number
  chunk_method?: string
  parser_config: ParserConfig
}

/** Initial state factory */
const INITIAL_FORM_DATA: VersionFormData = {
  version_label: '',
  pagerank: 0,
  parser_config: {
    layout_recognize: 'DeepDOC',
    chunk_token_num: 512,
    delimiter: '\\n',
    child_chunk: false,
    child_chunk_delimiter: '\\n',
    page_index: false,
    image_context_size: 128,
    auto_metadata: true,
    overlapped_percent: 4,
    auto_keywords: 0,
    auto_questions: 0,
    html4excel: false,
  },
}

interface VersionModalProps {
  /** Whether the modal is visible */
  open: boolean
  /** Whether the submit action is in progress */
  saving: boolean
  /** Category-level dataset_config (used to pre-fill built-in fields) */
  categoryConfig?: Record<string, any> | undefined
  /** Callback when the user confirms with form values */
  onOk: (data: VersionFormData) => void
  /** Callback when the user cancels or closes */
  onCancel: () => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal dialog with a form for creating a new category version.
 *
 * @param {VersionModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const VersionModal = ({ open, saving, categoryConfig, onOk, onCancel }: VersionModalProps) => {
  const { t } = useTranslation()
  const [formData, setFormData] = useState<VersionFormData>(INITIAL_FORM_DATA)
  const [parseMode, setParseMode] = useState<'builtin' | 'pipeline'>('builtin')
  const [labelError, setLabelError] = useState('')

  // Pre-fill parser config from category defaults when modal opens
  useEffect(() => {
    if (open && categoryConfig) {
      const pc = categoryConfig.parser_config || {}
      // RAGFlow stores overlapped_percent as decimal (0.04 = 4%), UI expects integer
      const rawOverlap = pc.overlapped_percent ?? 4
      const overlapped_percent = typeof rawOverlap === 'number' && rawOverlap > 0 && rawOverlap < 1
        ? Math.round(rawOverlap * 100)
        : rawOverlap

      setFormData({
        version_label: '',
        pagerank: 0,
        chunk_method: categoryConfig.chunk_method || 'naive',
        parser_config: {
          layout_recognize: pc.layout_recognize || 'DeepDOC',
          chunk_token_num: pc.chunk_token_num ?? 512,
          delimiter: pc.delimiter ?? '\\n',
          child_chunk: pc.child_chunk ?? false,
          child_chunk_delimiter: pc.child_chunk_delimiter ?? '\\n',
          page_index: pc.page_index ?? false,
          image_context_size: pc.image_context_size ?? 128,
          auto_metadata: pc.auto_metadata ?? true,
          overlapped_percent,
          auto_keywords: pc.auto_keywords ?? 0,
          auto_questions: pc.auto_questions ?? 0,
          html4excel: pc.html4excel ?? false,
        },
      })
    } else if (open) {
      setFormData(INITIAL_FORM_DATA)
    }
    setLabelError('')
    setParseMode('builtin')
  }, [open, categoryConfig])

  /**
   * Handle form submission with inline validation.
   */
  const handleOk = () => {
    if (!formData.version_label.trim()) {
      setLabelError(`${t('projectManagement.versions.label')} is required`)
      return
    }
    setLabelError('')
    onOk(formData)
  }

  /**
   * Reset parse mode and close.
   */
  const handleCancel = () => {
    setParseMode('builtin')
    onCancel()
  }

  /**
   * Update a top-level form field.
   * @param field - Field name
   * @param value - New value
   */
  const updateField = <K extends keyof VersionFormData>(field: K, value: VersionFormData[K]) => {
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

  return (
    <Modal
      title={t('projectManagement.versions.add')}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
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
            placeholder={t('projectManagement.versions.labelPlaceholder') || 'e.g. v1.0'}
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
                updateField('pipeline_id', undefined)
                updateField('parse_type', undefined)
              }
            }}
          >
            <Radio value="builtin">{t('projectManagement.versions.parseTypeBuiltIn')}</Radio>
            <Radio value="pipeline">{t('projectManagement.versions.parseTypeChoosePipeline')}</Radio>
          </Radio.Group>
        </div>

        {/* Built-in fields -- pre-filled from category, user can override */}
        {parseMode === 'builtin' && (
          <>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16 }}>
              {t('projectManagement.versions.builtInHint')}
            </Text>
            <BuiltInParserFields
              chunkMethod={formData.chunk_method ?? 'naive'}
              onChunkMethodChange={(v: string) => updateField('chunk_method', v)}
              parserConfig={formData.parser_config}
              onParserConfigChange={updateParserConfig}
            />
          </>
        )}

        {/* Pipeline fields -- only visible when "Choose pipeline" is selected */}
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
                value={formData.pipeline_id || ''}
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

export default VersionModal
