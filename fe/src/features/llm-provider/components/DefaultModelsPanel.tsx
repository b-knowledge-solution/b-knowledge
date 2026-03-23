/**
 * @fileoverview System Default Models panel for the LLM Provider admin page.
 *
 * Compact single-row layout showing one inline select per model type,
 * plus a VLM selector for chat models with vision support.
 *
 * @module features/llm-provider/components/DefaultModelsPanel
 */

import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  MessageSquare,
  Layers,
  Eye,
  Mic,
  Volume2,
  ArrowUpDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updateProvider } from '../api/llmProviderApi'
import { MODEL_TYPES } from '../types/llmProvider.types'
import type { ModelProvider, ModelType } from '../types/llmProvider.types'

// ============================================================================
// Constants
// ============================================================================

/** Icon mapping for each model type */
const MODEL_TYPE_ICONS: Record<ModelType, LucideIcon> = {
  chat: MessageSquare,
  embedding: Layers,
  image2text: Eye,
  speech2text: Mic,
  rerank: ArrowUpDown,
  tts: Volume2,
}

/** Accent colour classes for each model type icon */
const ICON_COLORS: Record<ModelType, string> = {
  chat: 'text-blue-600 dark:text-blue-400',
  embedding: 'text-green-600 dark:text-green-400',
  image2text: 'text-purple-600 dark:text-purple-400',
  speech2text: 'text-orange-600 dark:text-orange-400',
  rerank: 'text-teal-600 dark:text-teal-400',
  tts: 'text-pink-600 dark:text-pink-400',
}

// ============================================================================
// Types
// ============================================================================

interface DefaultModelsPanelProps {
  /** All active providers */
  providers: ModelProvider[]
  /** Callback fired after a default has been changed */
  onDefaultChanged: () => Promise<void>
}

// ============================================================================
// Component
// ============================================================================

/**
 * Compact single-row panel showing an inline select per model type,
 * plus a VLM selector for vision-enabled chat models.
 *
 * @param props - Component props
 * @returns React element
 */
export function DefaultModelsPanel({ providers, onDefaultChanged }: DefaultModelsPanelProps) {
  const { t } = useTranslation()

  /**
   * Handle changing the default provider for a given model type.
   * Sets is_default=true on the selected provider; the API will
   * automatically clear the previous default for that type.
   *
   * @param providerId - The provider to make default
   */
  const handleDefaultChange = async (providerId: string) => {
    try {
      // Update the selected provider to be the default for its type
      await updateProvider(providerId, { is_default: true })
      toast.success(t('llmProviders.defaultUpdated'))
      // Refresh the parent provider list to reflect the change
      await onDefaultChanged()
    } catch {
      toast.error(t('llmProviders.fetchError'))
    }
  }


  return (
    <Card>
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-base">{t('llmProviders.systemDefaults')}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        {/* Single row of inline selects — wraps on small screens */}
        <div className="flex flex-wrap items-center gap-3">
          {MODEL_TYPES.map((modelType) => {
            // Find all providers matching this type
            const typeProviders = providers.filter((p) => p.model_type === modelType)
            // Find the current default for this type
            const currentDefault = typeProviders.find((p) => p.is_default)
            // Resolve the icon component for this type
            const IconComponent = MODEL_TYPE_ICONS[modelType]

            return (
              <div
                key={modelType}
                className="flex items-center gap-1.5"
              >
                {/* Type icon + label */}
                <IconComponent size={14} className={ICON_COLORS[modelType]} />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {t(`llmProviders.modelTypes.${modelType}`)}:
                </span>

                {/* Inline select or "Not set" badge */}
                {typeProviders.length > 0 ? (
                  <Select
                    value={currentDefault?.id ?? ''}
                    onValueChange={handleDefaultChange}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[120px] max-w-[200px] text-xs">
                      <SelectValue placeholder={t('llmProviders.defaultNotSet')} />
                    </SelectTrigger>
                    <SelectContent>
                      {typeProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.factory_name} / {p.model_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500 italic">
                    {t('llmProviders.defaultNotSet')}
                  </span>
                )}

                {/* Separator */}
                <span className="text-gray-300 dark:text-gray-600 mx-0.5">|</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default DefaultModelsPanel

