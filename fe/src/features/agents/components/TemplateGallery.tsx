/**
 * @fileoverview Template gallery grid for browsing and using agent templates.
 * Displays available templates in a responsive card grid with skeleton loading.
 *
 * @module features/agents/components/TemplateGallery
 */

import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { useAgentTemplates } from '../api/agentQueries'
import type { AgentTemplate } from '../types/agent.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the TemplateGallery component
 */
interface TemplateGalleryProps {
  /** Callback when a template is selected for creating a new agent */
  onUseTemplate: (template: AgentTemplate) => void
}

// ============================================================================
// Skeleton Loading Card
// ============================================================================

/**
 * @description Skeleton placeholder card shown during template loading
 * @returns {JSX.Element} Animated skeleton card
 */
function SkeletonCard() {
  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardContent className="p-4 space-y-3 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full" />
        <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-4/5" />
        <div className="flex gap-2">
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-16" />
          <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-14" />
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Responsive grid of agent templates for quick-start workflow creation.
 * Shows template name, description, category and mode badges, with a "Use Template" button.
 * @param {TemplateGalleryProps} props - Callback for template selection
 * @returns {JSX.Element} Rendered template gallery grid
 */
export function TemplateGallery({ onUseTemplate }: TemplateGalleryProps) {
  const { t } = useTranslation()
  const { data: templates, isLoading } = useAgentTemplates()

  // Show skeleton cards while loading
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  // Empty state when no templates available
  if (!templates || templates.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        {t('common.noData')}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {templates.map((template) => (
        <Card
          key={template.id}
          className="hover:shadow-md transition-shadow dark:bg-slate-800 dark:border-slate-700"
        >
          <CardContent className="p-4 flex flex-col gap-2">
            {/* Template name */}
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {template.name}
            </h3>

            {/* Description (truncated to 2 lines) */}
            {template.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                {template.description}
              </p>
            )}

            {/* Category and mode badges */}
            <div className="flex gap-1.5">
              {template.category && (
                <Badge variant="outline" className="text-xs">
                  {template.category}
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                {t(`agents.${template.mode}`)}
              </Badge>
            </div>

            {/* Use Template button */}
            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              onClick={() => onUseTemplate(template)}
            >
              {t('agents.useTemplate')}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
