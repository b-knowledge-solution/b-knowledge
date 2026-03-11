/**
 * @fileoverview Category filter tabs for project list page.
 *
 * Shows All | Office | DataSync | Source Code (disabled) tabs.
 *
 * @module features/projects/components/CategoryFilterTabs
 */

import { useTranslation } from 'react-i18next'
import { Segmented } from 'antd'
import type { ProjectCategory } from '../api/projectService'

// ============================================================================
// Types
// ============================================================================

interface CategoryFilterTabsProps {
  /** Currently selected category filter (null = All) */
  selected: ProjectCategory | null
  /** Callback when a category is selected */
  onChange: (category: ProjectCategory | null) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Category filter tabs for the project list.
 *
 * @param props - Component props
 * @returns React element
 */
const CategoryFilterTabs = ({ selected, onChange }: CategoryFilterTabsProps) => {
  const { t } = useTranslation()

  return (
    <Segmented
      value={selected || 'all'}
      onChange={(value: string) => onChange(value === 'all' ? null : (value as ProjectCategory))}
      options={[
        { value: 'all', label: t('projectManagement.categoryFilter.all') },
        { value: 'office', label: t('projectManagement.categories.office') },
        { value: 'datasync', label: t('projectManagement.categories.datasync') },
        { value: 'source_code', label: t('projectManagement.categories.source_code'), disabled: true },
      ]}
    />
  )
}

export default CategoryFilterTabs
