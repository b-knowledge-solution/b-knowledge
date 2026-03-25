/**
 * @fileoverview Category filter tabs for project list page.
 *
 * Shows All | Office | DataSync | Source Code (disabled) tabs.
 *
 * @module features/projects/components/CategoryFilterTabs
 */

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { DocumentCategoryType } from '../api/projectApi'

// ============================================================================
// Types
// ============================================================================

interface CategoryFilterTabsProps {
  /** Currently selected category filter (null = All) */
  selected: DocumentCategoryType | null
  /** Callback when a category is selected */
  onChange: (category: DocumentCategoryType | null) => void
}

// ============================================================================
// Tab options
// ============================================================================

interface TabOption {
  value: string
  labelKey: string
  disabled?: boolean
}

const TAB_OPTIONS: TabOption[] = [
  { value: 'all', labelKey: 'projectManagement.categoryFilter.all' },
  { value: 'office', labelKey: 'projectManagement.categories.office' },
  { value: 'datasync', labelKey: 'projectManagement.categories.datasync' },
  { value: 'source_code', labelKey: 'projectManagement.categories.source_code', disabled: true },
]

// ============================================================================
// Component
// ============================================================================

/**
 * @description Category filter tabs for the project list, allowing users to filter by project type
 * @param {CategoryFilterTabsProps} props - Component props with selected state and change handler
 * @returns {JSX.Element} Rendered filter tabs
 */
const CategoryFilterTabs = ({ selected, onChange }: CategoryFilterTabsProps) => {
  const { t } = useTranslation()
  // Default to 'all' when no category is selected
  const currentValue = selected || 'all'

  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1">
      {TAB_OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          size="sm"
          disabled={option.disabled}
          onClick={() => onChange(option.value === 'all' ? null : (option.value as DocumentCategoryType))}
          className={
            currentValue === option.value
              ? 'bg-background shadow-sm text-foreground hover:bg-background'
              : 'text-muted-foreground hover:text-foreground'
          }
        >
          {t(option.labelKey)}
        </Button>
      ))}
    </div>
  )
}

export default CategoryFilterTabs
