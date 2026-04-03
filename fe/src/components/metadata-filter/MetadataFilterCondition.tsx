/**
 * @fileoverview A single metadata filter condition row.
 * @module components/metadata-filter/MetadataFilterCondition
 */
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import type { MetadataFilterCondition as ConditionType } from '@/components/metadata-filter/metadata-filter.types'

/** Available comparison operators */
const OPERATORS = ['is', 'is_not', 'contains', 'gt', 'lt', 'range'] as const

/**
 * @description Props for a single metadata filter condition row.
 */
interface MetadataFilterConditionProps {
  /** Current condition value */
  value: ConditionType
  /** Called when any field changes */
  onChange: (value: ConditionType) => void
  /** Called when this condition is removed */
  onRemove: () => void
}

/**
 * @description A single row in the metadata filter with key, operator, and value inputs.
 * Includes a remove button to delete the condition from the list.
 * @param {MetadataFilterConditionProps} props - Condition configuration
 * @returns {JSX.Element} Rendered condition row
 */
export function MetadataFilterCondition({ value, onChange, onRemove }: MetadataFilterConditionProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-start gap-2 rounded-md border p-2 dark:border-gray-600">
      {/* Metadata key input */}
      <input
        type="text"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder={t('metadataFilter.keyPlaceholder')}
        aria-label={t('metadataFilter.keyPlaceholder')}
        className="w-1/3 rounded border bg-background px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
      />

      {/* Operator dropdown */}
      <select
        value={value.comparison_operator}
        onChange={(e) => onChange({ ...value, comparison_operator: e.target.value as ConditionType['comparison_operator'] })}
        aria-label={t('metadataFilter.logic')}
        className="rounded border bg-background px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
      >
        {OPERATORS.map((op) => (
          <option key={op} value={op}>{t(`metadataFilter.op.${op}`)}</option>
        ))}
      </select>

      {/* Value input */}
      <input
        type="text"
        value={typeof value.value === 'string' ? value.value : String(value.value)}
        onChange={(e) => onChange({ ...value, value: e.target.value })}
        placeholder={t('metadataFilter.valuePlaceholder')}
        aria-label={t('metadataFilter.valuePlaceholder')}
        className="flex-1 rounded border bg-background px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
      />

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove condition"
        className="mt-0.5 rounded p-1 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}
