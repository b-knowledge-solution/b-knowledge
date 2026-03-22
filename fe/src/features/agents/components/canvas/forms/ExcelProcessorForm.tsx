/**
 * @fileoverview Excel Processor node configuration form.
 * Provides controls for reading, merging, transforming, and outputting
 * Excel/CSV files with sheet selection and merge strategies.
 *
 * @module features/agents/components/canvas/forms/ExcelProcessorForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for ExcelProcessor form fields
 */
interface ExcelProcessorConfig {
  input_files: string[]
  operation: 'read' | 'merge' | 'transform' | 'output'
  sheet_selection: string
  merge_strategy: 'concat' | 'join'
  join_on: string
  transform_instructions: string
  transform_data: string
  output_format: 'xlsx' | 'csv'
  output_filename: string
}

/** @description Default configuration for a new ExcelProcessor node */
const DEFAULTS: ExcelProcessorConfig = {
  input_files: [],
  operation: 'read',
  sheet_selection: 'all',
  merge_strategy: 'concat',
  join_on: '',
  transform_instructions: '',
  transform_data: '',
  output_format: 'xlsx',
  output_filename: 'output',
}

/**
 * @description Configuration form for the Excel Processor operator node.
 *   Supports four operations: read (parse Excel into structured data), merge
 *   (combine multiple files), transform (apply data transformations), and
 *   output (generate Excel/CSV file). Configurable sheet selection, merge
 *   strategies, and output options.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Excel Processor node configuration form
 */
export function ExcelProcessorForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<ExcelProcessorConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<ExcelProcessorConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<ExcelProcessorConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof ExcelProcessorConfig>(field: K, value: ExcelProcessorConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new input file variable reference
   */
  const addInputFile = () => {
    updateField('input_files', [...state.input_files, ''])
  }

  /**
   * @description Updates an input file reference at the given index
   */
  const updateInputFile = (index: number, value: string) => {
    const next = state.input_files.map((f, i) => (i === index ? value : f))
    updateField('input_files', next)
  }

  /**
   * @description Removes an input file reference at the given index
   */
  const removeInputFile = (index: number) => {
    const next = state.input_files.filter((_, i) => i !== index)
    updateField('input_files', next)
  }

  return (
    <div className="space-y-4">
      {/* Operation type selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.excelProcessor.operation', 'Operation')}</Label>
        <Select
          value={state.operation}
          onValueChange={(v: string) => updateField('operation', v as ExcelProcessorConfig['operation'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="read">{t('agents.forms.excelProcessor.read', 'Read')}</SelectItem>
            <SelectItem value="merge">{t('agents.forms.excelProcessor.merge', 'Merge')}</SelectItem>
            <SelectItem value="transform">{t('agents.forms.excelProcessor.transform', 'Transform')}</SelectItem>
            <SelectItem value="output">{t('agents.forms.excelProcessor.output', 'Output')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Input file variable references (for read and merge operations) */}
      {(state.operation === 'read' || state.operation === 'merge') && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('agents.forms.excelProcessor.inputFiles', 'Input Files')}</Label>
            <Button variant="ghost" size="sm" onClick={addInputFile}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('common.add', 'Add')}
            </Button>
          </div>

          {state.input_files.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('agents.forms.excelProcessor.noInputFiles', 'No input files. Add variable references to Excel/CSV files.')}
            </p>
          )}

          {state.input_files.map((f, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={f}
                onChange={(e) => updateInputFile(idx, e.target.value)}
                placeholder={t('agents.forms.excelProcessor.fileRefPlaceholder', 'component@file_output')}
                className="flex-1 text-sm"
              />
              <Button variant="ghost" size="icon" onClick={() => removeInputFile(idx)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Sheet selection (for read operations) */}
      {state.operation === 'read' && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.excelProcessor.sheetSelection', 'Sheet Selection')}</Label>
          <Input
            value={state.sheet_selection}
            onChange={(e) => updateField('sheet_selection', e.target.value)}
            placeholder="all"
          />
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.excelProcessor.sheetSelectionHint', '"all", "first", or comma-separated sheet names')}
          </p>
        </div>
      )}

      {/* Merge strategy (for merge operations) */}
      {state.operation === 'merge' && (
        <>
          <div className="space-y-1.5">
            <Label>{t('agents.forms.excelProcessor.mergeStrategy', 'Merge Strategy')}</Label>
            <Select
              value={state.merge_strategy}
              onValueChange={(v: string) => updateField('merge_strategy', v as ExcelProcessorConfig['merge_strategy'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="concat">{t('agents.forms.excelProcessor.concat', 'Concatenate Rows')}</SelectItem>
                <SelectItem value="join">{t('agents.forms.excelProcessor.join', 'Join on Column')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Join column (shown only when strategy is 'join') */}
          {state.merge_strategy === 'join' && (
            <div className="space-y-1.5">
              <Label>{t('agents.forms.excelProcessor.joinOn', 'Join Column')}</Label>
              <Input
                value={state.join_on}
                onChange={(e) => updateField('join_on', e.target.value)}
                placeholder={t('agents.forms.excelProcessor.joinOnPlaceholder', 'Column name to join on')}
              />
            </div>
          )}
        </>
      )}

      {/* Transform data reference (for transform and output operations) */}
      {(state.operation === 'transform' || state.operation === 'output') && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.excelProcessor.transformData', 'Data Variable')}</Label>
          <Input
            value={state.transform_data}
            onChange={(e) => updateField('transform_data', e.target.value)}
            placeholder={t('agents.forms.excelProcessor.transformDataPlaceholder', 'component@data_output')}
          />
        </div>
      )}

      {/* Transform instructions */}
      {state.operation === 'transform' && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.excelProcessor.transformInstructions', 'Transform Instructions')}</Label>
          <Textarea
            value={state.transform_instructions}
            onChange={(e) => updateField('transform_instructions', e.target.value)}
            placeholder={t('agents.forms.excelProcessor.transformInstructionsPlaceholder', 'Describe the transformation to apply...')}
            className="min-h-[80px]"
          />
        </div>
      )}

      {/* Output options (for output operation) */}
      {state.operation === 'output' && (
        <>
          <div className="space-y-1.5">
            <Label>{t('agents.forms.excelProcessor.outputFormat', 'Output Format')}</Label>
            <Select
              value={state.output_format}
              onValueChange={(v: string) => updateField('output_format', v as ExcelProcessorConfig['output_format'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">XLSX</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('agents.forms.excelProcessor.outputFilename', 'Output Filename')}</Label>
            <Input
              value={state.output_filename}
              onChange={(e) => updateField('output_filename', e.target.value)}
              placeholder="output"
            />
          </div>
        </>
      )}
    </div>
  )
}
