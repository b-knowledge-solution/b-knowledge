/**
 * @fileoverview Standard category content view.
 *
 * Renders a single-dataset file list via DocumentListPanel for standard categories.
 * Includes a header with category name, parser config badge, and upload button.
 * Null guard shows error state if dataset_id is missing.
 *
 * @module features/knowledge-base/components/StandardCategoryView
 */

import { useTranslation } from 'react-i18next'
import { FileText, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

import type { DocumentCategory } from '../api/knowledgeBaseApi'
import DocumentListPanel from './DocumentListPanel'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the StandardCategoryView component
 */
interface StandardCategoryViewProps {
  /** Knowledge Base UUID for API calls */
  knowledgeBaseId: string
  /** The standard category to display */
  category: DocumentCategory
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Displays a standard category's content as a single-dataset file list.
 * Shows DocumentListPanel when dataset_id is available, or an error state when missing.
 * @param {StandardCategoryViewProps} props - Component props including project ID and category
 * @returns {JSX.Element} Rendered standard category view with header and file list
 */
const StandardCategoryView = ({ knowledgeBaseId, category }: StandardCategoryViewProps) => {
  const { t } = useTranslation()

  // Null guard: standard categories should always have a linked dataset
  if (!category.dataset_id) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <EmptyState
          icon={<FileText className="h-10 w-10 text-muted-foreground" />}
          title={t('projects.datasetNotAvailable', 'Dataset not available for this category')}
        />
      </div>
    )
  }

  // Extract parser config summary for the badge display
  const parserSummary = category.dataset_config?.chunk_method || 'naive'

  return (
    <div className="flex flex-col h-full">
      {/* Header: category name + parser config badge */}
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700">
        <div className="flex items-center gap-3">
          <h2 className="text-[20px] font-semibold leading-[1.2] text-foreground">
            {category.name}
          </h2>
          <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Settings className="h-3 w-3 mr-1" />
            {t('projects.parserConfig', 'Parser Config')}: {parserSummary}
          </Badge>
        </div>
      </div>

      {/* File list via DocumentListPanel — passes dataset_id as versionId for single-dataset categories */}
      <div className="flex-1 min-h-0">
        <DocumentListPanel
          knowledgeBaseId={knowledgeBaseId}
          categoryId={category.id}
          versionId={category.dataset_id}
        />
      </div>
    </div>
  )
}

export default StandardCategoryView
