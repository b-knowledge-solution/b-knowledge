/**
 * @fileoverview RAG Retrieval node configuration form.
 * Provides controls for dataset selection, similarity threshold, top-K,
 * retrieval method, reranking, and query source configuration.
 *
 * @module features/agents/components/canvas/forms/RetrievalForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for Retrieval form fields
 */
interface RetrievalConfig {
  dataset_ids: string[]
  similarity_threshold: number
  top_k: number
  retrieval_method: 'hybrid' | 'vector' | 'keyword'
  reranking_enabled: boolean
  query_source: 'upstream' | 'custom'
  custom_query: string
}

/** @description Default configuration for a new Retrieval node */
const DEFAULTS: RetrievalConfig = {
  dataset_ids: [],
  similarity_threshold: 0.3,
  top_k: 5,
  retrieval_method: 'hybrid',
  reranking_enabled: false,
  query_source: 'upstream',
  custom_query: '',
}

/**
 * @description Configuration form for the RAG Retrieval operator node.
 *   Allows selecting datasets, tuning similarity threshold and top-K,
 *   choosing retrieval method, toggling reranking, and configuring query source.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Retrieval node configuration form
 */
export function RetrievalForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<RetrievalConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<RetrievalConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<RetrievalConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof RetrievalConfig>(field: K, value: RetrievalConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* Dataset IDs (comma-separated input until multi-select is available) */}
      <div className="space-y-1.5">
        <Label>{t('agents.retrieval.datasets', 'Dataset IDs')}</Label>
        <Input
          value={state.dataset_ids.join(', ')}
          onChange={(e) => {
            // Parse comma-separated dataset IDs
            const ids = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
            updateField('dataset_ids', ids)
          }}
          placeholder={t('agents.retrieval.datasetsPlaceholder', 'Enter dataset IDs, comma-separated')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.retrieval.datasetsHint', 'Comma-separated UUIDs of accessible datasets')}
        </p>
      </div>

      {/* Similarity threshold slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('agents.retrieval.similarityThreshold', 'Similarity Threshold')}</Label>
          <span className="text-xs text-muted-foreground">{state.similarity_threshold.toFixed(2)}</span>
        </div>
        <Slider
          value={[state.similarity_threshold]}
          onValueChange={([v]: number[]) => updateField('similarity_threshold', v!)}
          min={0}
          max={1}
          step={0.05}
        />
      </div>

      {/* Top-K input */}
      <div className="space-y-1.5">
        <Label>{t('agents.retrieval.topK', 'Top K')}</Label>
        <Input
          type="number"
          value={state.top_k}
          onChange={(e) => updateField('top_k', Math.max(1, Math.min(100, Number(e.target.value) || 5)))}
          min={1}
          max={100}
        />
      </div>

      {/* Retrieval method selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.retrieval.method', 'Retrieval Method')}</Label>
        <Select
          value={state.retrieval_method}
          onValueChange={(v: string) => updateField('retrieval_method', v as RetrievalConfig['retrieval_method'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hybrid">{t('agents.retrieval.hybrid', 'Hybrid')}</SelectItem>
            <SelectItem value="vector">{t('agents.retrieval.vector', 'Vector')}</SelectItem>
            <SelectItem value="keyword">{t('agents.retrieval.keyword', 'Keyword')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reranking toggle */}
      <div className="flex items-center justify-between">
        <Label>{t('agents.retrieval.reranking', 'Reranking')}</Label>
        <Switch
          checked={state.reranking_enabled}
          onCheckedChange={(v: boolean) => updateField('reranking_enabled', v)}
        />
      </div>

      {/* Query source selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.retrieval.querySource', 'Query Source')}</Label>
        <Select
          value={state.query_source}
          onValueChange={(v: string) => updateField('query_source', v as RetrievalConfig['query_source'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upstream">{t('agents.retrieval.upstream', 'Upstream Node Output')}</SelectItem>
            <SelectItem value="custom">{t('agents.retrieval.custom', 'Custom Query Template')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Custom query template (shown only when query_source is 'custom') */}
      {state.query_source === 'custom' && (
        <div className="space-y-1.5">
          <Label>{t('agents.retrieval.customQuery', 'Custom Query')}</Label>
          <Input
            value={state.custom_query}
            onChange={(e) => updateField('custom_query', e.target.value)}
            placeholder={t('agents.retrieval.customQueryPlaceholder', 'Enter query template...')}
          />
        </div>
      )}
    </div>
  )
}
