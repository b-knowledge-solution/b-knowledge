/**
 * @fileoverview Related search questions component.
 * Displays clickable question chips as follow-up suggestions.
 * @module features/ai/components/RelatedSearchQuestions
 */

import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// Props
// ============================================================================

/** @description Props for the RelatedSearchQuestions component */
interface RelatedSearchQuestionsProps {
  /** Array of related question strings */
  questions: string[]
  /** Callback when a question chip is clicked */
  onQuestionClick: (question: string) => void
  /** Optional CSS class name */
  className?: string | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders related search question suggestions as clickable chips.
 * Only renders if there are questions to display.
 *
 * @param {RelatedSearchQuestionsProps} props - Component properties
 * @returns {JSX.Element | null} The rendered question chips or null
 */
function RelatedSearchQuestions({
  questions,
  onQuestionClick,
  className,
}: RelatedSearchQuestionsProps) {
  const { t } = useTranslation()

  // Don't render if no questions available
  if (questions.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      {/* Section heading */}
      <h4 className="text-sm font-semibold text-foreground">
        {t('search.relatedSearch')}
      </h4>

      {/* Question chips */}
      <div className="flex flex-wrap gap-2">
        {questions.map((question, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => onQuestionClick(question)}
          >
            <Search className="h-3 w-3" />
            {question}
          </Button>
        ))}
      </div>
    </div>
  )
}

export default RelatedSearchQuestions
