/**
 * @fileoverview Code category content view.
 *
 * Renders a single-dataset file list via DocumentListPanel for code categories,
 * with language badges and a collapsible git sync placeholder panel.
 * Git sync is deferred to a future phase per RESEARCH.md Open Question 1.
 *
 * @module features/knowledge-base/components/CodeCategoryView
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Code2, GitBranch, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

import type { DocumentCategory } from '../api/knowledgeBaseApi'
import DocumentListPanel from './DocumentListPanel'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the CodeCategoryView component
 */
interface CodeCategoryViewProps {
  /** Knowledge Base UUID for API calls */
  knowledgeBaseId: string
  /** The code category to display */
  category: DocumentCategory
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Displays a code category's content as a single-dataset file list with language badges
 * and a collapsible git sync placeholder. Git sync functionality is deferred to a future phase.
 * @param {CodeCategoryViewProps} props - Component props including project ID and category
 * @returns {JSX.Element} Rendered code category view with header, git sync panel, and file list
 */
const CodeCategoryView = ({ knowledgeBaseId, category }: CodeCategoryViewProps) => {
  const { t } = useTranslation()

  // Track collapsible git sync panel open/closed state
  const [gitSyncOpen, setGitSyncOpen] = useState(false)

  // Null guard: code categories should always have a linked dataset
  if (!category.dataset_id) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <EmptyState
          icon={<Code2 className="h-10 w-10 text-muted-foreground" />}
          title={t('knowledgeBase.datasetNotAvailable', 'Dataset not available for this category')}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header: category name + language badge + upload button */}
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700">
        <div className="flex items-center gap-3">
          <h2 className="text-[20px] font-semibold leading-[1.2] text-foreground">
            {category.name}
          </h2>
          {/* Static "Code" language badge — language detection from uploaded files will come with actual usage */}
          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <Code2 className="h-3 w-3 mr-1" />
            {t('knowledgeBase.codeTab', 'Code')}
          </Badge>
        </div>
      </div>

      {/* Git sync placeholder panel — deferred to future phase */}
      <Collapsible open={gitSyncOpen} onOpenChange={setGitSyncOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:bg-accent/50 dark:hover:bg-accent/20 transition-colors border-b dark:border-slate-700">
            {/* Chevron indicator for collapse state */}
            {gitSyncOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <GitBranch className="h-4 w-4" />
            <span>{t('knowledgeBase.gitSyncTitle', 'Git Sync')}</span>
            <Badge variant="secondary" className="ml-auto text-xs">
              {t('knowledgeBase.gitSyncComingSoon', 'Git repository sync coming soon')}
            </Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 py-4 bg-muted/50 dark:bg-muted/20 border-b dark:border-slate-700">
            <p className="text-sm text-muted-foreground mb-3">
              {t('knowledgeBase.gitSyncComingSoon', 'Git repository sync coming soon')}
            </p>
            {/* Disabled connect button — git sync deferred per RESEARCH.md Open Question 1 */}
            <Button variant="outline" size="sm" disabled>
              <GitBranch className="h-4 w-4 mr-2" />
              {t('knowledgeBase.connectRepository', 'Connect Repository')}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

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

export default CodeCategoryView
