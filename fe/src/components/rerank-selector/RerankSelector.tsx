/**
 * @fileoverview Rerank model selector with conditional Top K slider.
 * Used in both Chat assistant and Search app configuration.
 * @module components/rerank-selector/RerankSelector
 */
import { useTranslation } from 'react-i18next'
import { ModelSelector } from '@/components/model-selector/ModelSelector'

/**
 * @description Props for the RerankSelector component.
 */
interface RerankSelectorProps {
  /** Currently selected rerank provider ID */
  rerankId: string
  /** Top K value for reranker input size */
  topK: number
  /** Called when rerank model changes */
  onRerankChange: (id: string) => void
  /** Called when Top K value changes */
  onTopKChange: (value: number) => void
}

/**
 * @description Rerank model dropdown with a conditional Top K slider.
 * Top K slider only appears when a rerank model is selected.
 * Matches RAGFlow's rerank UI pattern.
 * @param {RerankSelectorProps} props - Component configuration
 * @returns {JSX.Element} Rendered rerank selector
 */
export function RerankSelector({ rerankId, topK, onRerankChange, onTopKChange }: RerankSelectorProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      {/* Rerank model dropdown */}
      <div className="space-y-1">
        <label className="text-sm font-medium">{t('llmSettings.rerankModel')}</label>
        <ModelSelector
          modelType="rerank"
          value={rerankId}
          onChange={onRerankChange}
          placeholder={t('llmSettings.rerankPlaceholder')}
        />
      </div>

      {/* Top K slider -- only shown when a rerank model is selected */}
      {rerankId && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">{t('llmSettings.topK')}</label>
            <span className="text-sm tabular-nums text-muted-foreground">{topK}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              role="slider"
              min={1}
              max={2048}
              step={1}
              value={topK}
              onChange={(e) => onTopKChange(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-primary"
            />
            <input
              type="number"
              min={1}
              max={2048}
              value={topK}
              onChange={(e) => {
                const v = Number(e.target.value)
                // Clamp to valid range before emitting
                if (v >= 1 && v <= 2048) onTopKChange(v)
              }}
              className="w-20 rounded border bg-background px-2 py-0.5 text-sm tabular-nums dark:border-gray-600"
            />
          </div>
        </div>
      )}
    </div>
  )
}
