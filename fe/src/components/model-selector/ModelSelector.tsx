/**
 * @fileoverview Dropdown selector for model providers, fetched from public API.
 * Groups models by factory_name and marks default with a star badge.
 * @module components/model-selector/ModelSelector
 */
import { useQuery } from '@tanstack/react-query'
import { listModels, type PublicModelProvider } from '@/lib/llmProviderPublicApi'

/**
 * @description Props for the ModelSelector component.
 */
interface ModelSelectorProps {
  /** Model type to filter by: 'chat', 'rerank', 'embedding', 'tts' */
  modelType: string
  /** Currently selected provider ID */
  value: string
  /** Called when selection changes */
  onChange: (id: string) => void
  /** Placeholder text when nothing selected */
  placeholder?: string
  /** Whether the selector is disabled */
  disabled?: boolean
}

/**
 * @description A select dropdown that lists available model providers filtered by type.
 * Fetches from the public /api/models endpoint (no admin permission required).
 * Options are grouped by factory_name and show model_name as the display label.
 * Default models are marked with a star symbol.
 * @param {ModelSelectorProps} props - Selector configuration
 * @returns {JSX.Element} Rendered model selector
 */
export function ModelSelector({ modelType, value, onChange, placeholder, disabled }: ModelSelectorProps) {
  // Fetch available models for the given type
  const { data: models = [], isLoading } = useQuery({
    queryKey: ['public-models', modelType],
    queryFn: () => listModels(modelType),
    staleTime: 60_000,
  })

  // Group models by factory_name for optgroup rendering
  const groups = models.reduce<Record<string, PublicModelProvider[]>>((acc, m) => {
    const group = acc[m.factory_name] ?? []
    group.push(m)
    acc[m.factory_name] = group
    return acc
  }, {})

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || isLoading}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-600"
    >
      {/* Empty placeholder option */}
      <option value="">{isLoading ? 'Loading...' : (placeholder ?? 'Select a model')}</option>

      {/* Grouped model options */}
      {Object.entries(groups).map(([factory, factoryModels]) => (
        <optgroup key={factory} label={factory}>
          {factoryModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.model_name}{m.is_default ? ' \u2605' : ''}{m.max_tokens ? ` (${m.max_tokens.toLocaleString()} tokens)` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
