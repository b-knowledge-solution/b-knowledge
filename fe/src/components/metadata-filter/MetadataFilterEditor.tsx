/**
 * @fileoverview Metadata filter editor with AND/OR logic and dynamic conditions.
 * Used in both Chat assistant and Search app configuration.
 * @module components/metadata-filter/MetadataFilterEditor
 */
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { MetadataFilterCondition } from './MetadataFilterCondition'
import type { MetadataFilter, MetadataFilterCondition as ConditionType } from '@/components/metadata-filter/metadata-filter.types'

/**
 * @description Props for the MetadataFilterEditor component.
 */
interface MetadataFilterEditorProps {
  /** Current filter value */
  value: MetadataFilter
  /** Called when filter changes */
  onChange: (value: MetadataFilter) => void
}

/**
 * @description Metadata filter editor with logic selector and dynamic condition rows.
 * Shows AND/OR logic toggle when 2+ conditions exist.
 * Matches RAGFlow's manual metadata filter UI pattern.
 * @param {MetadataFilterEditorProps} props - Editor configuration
 * @returns {JSX.Element} Rendered metadata filter editor
 */
export function MetadataFilterEditor({ value, onChange }: MetadataFilterEditorProps) {
  const { t } = useTranslation()

  /** Add a new empty condition */
  const addCondition = () => {
    onChange({
      ...value,
      conditions: [...value.conditions, { name: '', comparison_operator: 'is', value: '' }],
    })
  }

  /** Update a condition at a specific index */
  const updateCondition = (index: number, updated: ConditionType) => {
    const conditions = [...value.conditions]
    conditions[index] = updated
    onChange({ ...value, conditions })
  }

  /** Remove a condition at a specific index */
  const removeCondition = (index: number) => {
    onChange({
      ...value,
      conditions: value.conditions.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="space-y-2">
      {/* Logic selector -- only visible with 2+ conditions */}
      {value.conditions.length >= 2 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">{t('metadataFilter.logic')}</label>
          <select
            value={value.logic}
            onChange={(e) => onChange({ ...value, logic: e.target.value as 'and' | 'or' })}
            aria-label={t('metadataFilter.logic')}
            className="rounded border bg-background px-2 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="and">AND</option>
            <option value="or">OR</option>
          </select>
        </div>
      )}

      {/* Condition rows */}
      {value.conditions.map((condition, i) => (
        <MetadataFilterCondition
          key={i}
          value={condition}
          onChange={(c) => updateCondition(i, c)}
          onRemove={() => removeCondition(i)}
        />
      ))}

      {/* Add condition button */}
      <button
        type="button"
        onClick={addCondition}
        className="flex items-center gap-1 rounded-md border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary dark:border-gray-600"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('metadataFilter.addCondition')}
      </button>
    </div>
  )
}
