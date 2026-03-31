/**
 * @fileoverview List Operations node configuration form.
 * Provides controls for array-level operations: topN, head, tail,
 * filter, sort, and drop_duplicates.
 *
 * @module features/agents/components/canvas/forms/ListOperationsForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Supported list operation types matching the RAGFlow backend
 */
type ListOperation = 'topN' | 'head' | 'tail' | 'filter' | 'sort' | 'drop_duplicates'

/**
 * @description Internal state shape for ListOperations form fields
 */
interface ListOperationsConfig {
  query: string
  operations: ListOperation
  n: number
  sort_method: 'asc' | 'desc'
  filter: {
    operator: '=' | '!=' | 'contains' | 'start with' | 'end with'
    value: string
  }
}

/** @description Default configuration for a new ListOperations node */
const DEFAULTS: ListOperationsConfig = {
  query: '',
  operations: 'topN',
  n: 5,
  sort_method: 'asc',
  filter: {
    operator: '=',
    value: '',
  },
}

/**
 * @description Configuration form for the List Operations operator node.
 *   Operates on arrays (lists). Supports taking top-N elements, accessing
 *   by index (head/tail), filtering by comparison, sorting, and deduplication.
 *   Outputs result array, first element, and last element.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} List Operations node configuration form
 */
export function ListOperationsForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<ListOperationsConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<ListOperationsConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<ListOperationsConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof ListOperationsConfig>(field: K, value: ListOperationsConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  // Operations that use the N parameter
  const usesN = ['topN', 'head', 'tail'].includes(state.operations)

  return (
    <div className="space-y-4">
      {/* Input array variable reference */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.listOperations.input', 'Input Array Variable')}</Label>
        <Input
          value={state.query}
          onChange={(e) => updateField('query', e.target.value)}
          placeholder={t('agents.forms.listOperations.inputPlaceholder', 'component@output_array')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.listOperations.inputHint', 'Variable reference pointing to an array')}
        </p>
      </div>

      {/* Operation type selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.listOperations.operation', 'Operation')}</Label>
        <Select
          value={state.operations}
          onValueChange={(v: string) => updateField('operations', v as ListOperation)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="topN">{t('agents.forms.listOperations.topN', 'Top N')}</SelectItem>
            <SelectItem value="head">{t('agents.forms.listOperations.head', 'Head (Nth element)')}</SelectItem>
            <SelectItem value="tail">{t('agents.forms.listOperations.tail', 'Tail (Nth from end)')}</SelectItem>
            <SelectItem value="filter">{t('agents.forms.listOperations.filter', 'Filter')}</SelectItem>
            <SelectItem value="sort">{t('agents.forms.listOperations.sort', 'Sort')}</SelectItem>
            <SelectItem value="drop_duplicates">{t('agents.forms.listOperations.dropDuplicates', 'Drop Duplicates')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* N parameter for topN, head, tail */}
      {usesN && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.listOperations.n', 'N')}</Label>
          <Input
            type="number"
            value={state.n}
            onChange={(e) => updateField('n', Math.max(0, Number(e.target.value) || 0))}
            min={0}
            max={10000}
          />
        </div>
      )}

      {/* Sort direction for sort operation */}
      {state.operations === 'sort' && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.listOperations.sortMethod', 'Sort Direction')}</Label>
          <Select
            value={state.sort_method}
            onValueChange={(v: string) => updateField('sort_method', v as 'asc' | 'desc')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">{t('agents.forms.listOperations.ascending', 'Ascending')}</SelectItem>
              <SelectItem value="desc">{t('agents.forms.listOperations.descending', 'Descending')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Filter condition for filter operation */}
      {state.operations === 'filter' && (
        <div className="space-y-2">
          <Label>{t('agents.forms.listOperations.filterCondition', 'Filter Condition')}</Label>
          <div className="flex items-center gap-2">
            {/* Filter operator */}
            <Select
              value={state.filter.operator}
              onValueChange={(v: string) =>
                updateField('filter', { ...state.filter, operator: v as ListOperationsConfig['filter']['operator'] })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="=">=</SelectItem>
                <SelectItem value="!=">!=</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
                <SelectItem value="start with">Starts With</SelectItem>
                <SelectItem value="end with">Ends With</SelectItem>
              </SelectContent>
            </Select>
            {/* Filter value */}
            <Input
              value={state.filter.value}
              onChange={(e) => updateField('filter', { ...state.filter, value: e.target.value })}
              placeholder={t('agents.forms.listOperations.filterValue', 'Comparison value')}
              className="flex-1 text-sm"
            />
          </div>
        </div>
      )}

      {/* Drop duplicates has no additional params */}
      {state.operations === 'drop_duplicates' && (
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.listOperations.dropDuplicatesHint', 'Removes duplicate elements while preserving order.')}
        </p>
      )}
    </div>
  )
}
