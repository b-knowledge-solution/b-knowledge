/**
 * @fileoverview Modal form for creating a new category version.
 * Includes page rank slider and ingestion pipeline toggle (Built-in vs Choose pipeline).
 * When "Built-in" is selected, shows parser config fields pre-filled from category defaults.
 * Uses native useState instead of form libraries.
 * @module features/projects/components/VersionModal
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Info } from 'lucide-react'
import BuiltInParserFields, { type ParserConfig } from './BuiltInParserFields'

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
 * @description Modal dialog with a form for creating a new category version.
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
   * @description Handle form submission with inline validation.
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
   * @description Reset parse mode and close.
   */
  const handleCancel = () => {
    setParseMode('builtin')
    onCancel()
  }

  /**
   * @description Update a top-level form field.
   * @param field - Field name
   * @param value - New value
   */
  const updateField = <K extends keyof VersionFormData>(field: K, value: VersionFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * @description Update a parser_config field.
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
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) handleCancel() }}>
      <DialogContent className="max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('projectManagement.versions.add')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Version label */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('projectManagement.versions.label')} <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder={t('projectManagement.versions.labelPlaceholder') || 'e.g. v1.0'}
              value={formData.version_label}
              onChange={(e) => {
                updateField('version_label', e.target.value)
                if (labelError) setLabelError('')
              }}
              className={labelError ? 'border-destructive' : ''}
            />
            {labelError && <p className="text-destructive text-xs mt-1">{labelError}</p>}
          </div>

          {/* Page Rank slider */}
          <div>
            <label className="block text-sm font-medium mb-1">
              <span className="flex items-center gap-1">
                {t('projectManagement.versions.pageRank')}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('projectManagement.versions.pageRankTip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0} max={100}
                value={formData.pagerank}
                onChange={(e) => updateField('pagerank', Number(e.target.value))}
                className="flex-1 h-2 accent-primary"
              />
              <Input
                type="number"
                min={0} max={100}
                className="w-[70px]"
                value={formData.pagerank}
                onChange={(e) => updateField('pagerank', Number(e.target.value))}
              />
            </div>
          </div>

          {/* Ingestion pipeline section */}
          <div className="flex items-center gap-2">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">
              {t('projectManagement.versions.pipelineSection')}
            </span>
            <Separator className="flex-1" />
          </div>

          {/* Parse type radio toggle */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('projectManagement.versions.parseType')}
            </label>
            <RadioGroup
              value={parseMode}
              onValueChange={(value: string) => {
                setParseMode(value as 'builtin' | 'pipeline')
                if (value === 'builtin') {
                  updateField('pipeline_id', undefined)
                  updateField('parse_type', undefined)
                }
              }}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="builtin" id="parse-builtin" />
                <Label htmlFor="parse-builtin">{t('projectManagement.versions.parseTypeBuiltIn')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="pipeline" id="parse-pipeline" />
                <Label htmlFor="parse-pipeline">{t('projectManagement.versions.parseTypeChoosePipeline')}</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Built-in fields -- pre-filled from category, user can override */}
          {parseMode === 'builtin' && (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                {t('projectManagement.versions.builtInHint')}
              </p>
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
              <p className="text-xs text-muted-foreground mb-4">
                {t('projectManagement.versions.pipelineSectionTip')}
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">
                  {t('projectManagement.versions.pipelineId')} <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder={t('projectManagement.versions.pipelineIdPlaceholder')}
                  value={formData.pipeline_id || ''}
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

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleOk} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default VersionModal
