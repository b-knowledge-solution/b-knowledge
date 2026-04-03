/**
 * @fileoverview Shared controlled form component for building metadata filter
 * conditions. Used by search and dataset retrieval test views to construct
 * structured filter objects for the RAG pipeline.
 *
 * @module components/MetadataFilterBuilder
 */

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// ============================================================================
// Types
// ============================================================================

/** Comparison operators supported by the metadata filter. */
export type ComparisonOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'

/** A single filter condition on a metadata field. */
export interface MetadataCondition {
  /** Metadata field name */
  name: string
  /** Comparison operator */
  comparison_operator: ComparisonOperator
  /** Value to compare against */
  value: string
}

/** A group of filter conditions with a logic operator. */
export interface MetadataFilter {
  /** Logical combinator: 'and' requires all conditions, 'or' requires any */
  logic: 'and' | 'or'
  /** Array of filter conditions */
  conditions: MetadataCondition[]
}

/**
 * Props for the MetadataFilterBuilder component.
 */
export interface MetadataFilterBuilderProps {
  /** Current filter value (controlled) */
  value: MetadataFilter
  /** Callback when filter changes */
  onChange: (filter: MetadataFilter) => void
  /** Whether the form is disabled */
  disabled?: boolean | undefined
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of conditions allowed. */
const MAX_CONDITIONS = 10

/** Human-readable labels for comparison operators. */
const OPERATOR_LABELS: Record<ComparisonOperator, string> = {
  eq: 'equals',
  ne: 'not equals',
  gt: 'greater than',
  gte: 'greater or equal',
  lt: 'less than',
  lte: 'less or equal',
  contains: 'contains',
  not_contains: 'not contains',
}

/** Ordered list of operators for the select dropdown. */
const OPERATORS: ComparisonOperator[] = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'not_contains',
]

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Create a new empty condition with defaults.
 * @returns A blank MetadataCondition
 */
function createEmptyCondition(): MetadataCondition {
  return { name: '', comparison_operator: 'eq', value: '' }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Controlled form for building metadata filter conditions.
 * Supports AND/OR logic toggle, up to 10 condition rows, and add/remove controls.
 * @param props - Component props
 * @returns MetadataFilterBuilder form
 */
export function MetadataFilterBuilder({
  value,
  onChange,
  disabled = false,
}: MetadataFilterBuilderProps) {
  const { t } = useTranslation()
  const { logic, conditions } = value

  /**
   * Toggle between AND and OR logic.
   */
  const handleLogicToggle = () => {
    onChange({ ...value, logic: logic === 'and' ? 'or' : 'and' })
  }

  /**
   * Add a new empty condition row.
   */
  const handleAddCondition = () => {
    if (conditions.length >= MAX_CONDITIONS) return
    onChange({ ...value, conditions: [...conditions, createEmptyCondition()] })
  }

  /**
   * Remove a condition by index.
   */
  const handleRemoveCondition = (index: number) => {
    const updated = conditions.filter((_, i) => i !== index)
    onChange({ ...value, conditions: updated })
  }

  /**
   * Update a single condition field by index.
   */
  const handleConditionChange = (
    index: number,
    field: keyof MetadataCondition,
    fieldValue: string
  ) => {
    const updated = conditions.map((c, i) => {
      if (i !== index) return c
      return { ...c, [field]: fieldValue }
    })
    onChange({ ...value, conditions: updated })
  }

  return (
    <div className="space-y-3">
      {/* Logic toggle and header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{t('metadataFilter.conditions')}</span>
          {conditions.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={handleLogicToggle}
              className="h-6 px-2 text-xs"
            >
              {logic.toUpperCase()}
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || conditions.length >= MAX_CONDITIONS}
          onClick={handleAddCondition}
          className="h-7 gap-1 text-xs"
        >
          <Plus className="h-3 w-3" />
          {t('common.add')}
        </Button>
      </div>

      {/* Condition rows */}
      {conditions.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">
          {t('metadataFilter.empty')}
        </p>
      )}

      <div className="space-y-2">
        {conditions.map((condition, index) => (
          <div
            key={index}
            className={cn(
              'flex items-center gap-2',
              'rounded-md border border-border/50 bg-muted/30 p-2'
            )}
          >
            {/* Field name input */}
            <Input
              placeholder={t('metadataFilter.fieldName')}
              value={condition.name}
              onChange={(e) => handleConditionChange(index, 'name', e.target.value)}
              disabled={disabled}
              className="h-8 flex-1 min-w-0 text-sm"
            />

            {/* Operator select */}
            <Select
              value={condition.comparison_operator}
              onValueChange={(v: string) => handleConditionChange(index, 'comparison_operator', v)}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 w-[140px] shrink-0 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op: ComparisonOperator) => (
                  <SelectItem key={op} value={op}>
                    {OPERATOR_LABELS[op]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value input */}
            <Input
              placeholder={t('metadataFilter.value')}
              value={condition.value}
              onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
              disabled={disabled}
              className="h-8 flex-1 min-w-0 text-sm"
            />

            {/* Remove button */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => handleRemoveCondition(index)}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
