/**
 * @fileoverview LLM Categorize node configuration form.
 * Provides controls for defining category name/description pairs,
 * example queries for each category, and the LLM classification prompt.
 *
 * @module features/agents/components/canvas/forms/CategorizeForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import type { NodeFormProps } from './types'

/**
 * @description Single category definition with name, description, and example queries
 */
interface CategoryDef {
  name: string
  description: string
  examples: string
}

/**
 * @description Internal state shape for Categorize form fields
 */
interface CategorizeConfig {
  model: string
  query: string
  categories: CategoryDef[]
  message_history_window_size: number
  temperature: number
}

/** @description Default configuration for a new Categorize node */
const DEFAULTS: CategorizeConfig = {
  model: '',
  query: 'sys.query',
  categories: [],
  message_history_window_size: 1,
  temperature: 0.1,
}

/**
 * @description Configuration form for the LLM Categorize operator node.
 *   Uses an LLM to classify user input into one of several defined categories.
 *   Each category has a name, description, and optional example queries for
 *   few-shot classification. The matched category determines downstream routing.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Categorize node configuration form
 */
export function CategorizeForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<CategorizeConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<CategorizeConfig>),
  }))

  // Re-sync local state when config prop changes (e.g. undo/redo)
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<CategorizeConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   * @param {keyof CategorizeConfig} field - Field name to update
   * @param {CategorizeConfig[keyof CategorizeConfig]} value - New value
   */
  const updateField = <K extends keyof CategorizeConfig>(field: K, value: CategorizeConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new empty category definition
   */
  const addCategory = () => {
    const next = [...state.categories, { name: '', description: '', examples: '' }]
    updateField('categories', next)
  }

  /**
   * @description Updates a specific category at the given index
   */
  const updateCategory = (index: number, partial: Partial<CategoryDef>) => {
    const next = state.categories.map((c, i) => (i === index ? { ...c, ...partial } : c))
    updateField('categories', next)
  }

  /**
   * @description Removes the category at the given index
   */
  const removeCategory = (index: number) => {
    const next = state.categories.filter((_, i) => i !== index)
    updateField('categories', next)
  }

  return (
    <div className="space-y-4">
      {/* LLM Model selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.categorize.model', 'Model')}</Label>
        <Select value={state.model} onValueChange={(v: string) => updateField('model', v)}>
          <SelectTrigger>
            <SelectValue placeholder={t('agents.forms.categorize.selectModel', 'Select model')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
            <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
            <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
            <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
            <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Query variable reference */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.categorize.query', 'Query Variable')}</Label>
        <Input
          value={state.query}
          onChange={(e) => updateField('query', e.target.value)}
          placeholder="sys.query"
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.categorize.queryHint', 'Variable reference for the input to classify')}
        </p>
      </div>

      {/* Temperature slider for classification certainty */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.categorize.temperature', 'Temperature')}</Label>
          <span className="text-xs text-muted-foreground">{state.temperature.toFixed(1)}</span>
        </div>
        <Slider
          value={[state.temperature]}
          onValueChange={([v]: number[]) => updateField('temperature', v!)}
          min={0}
          max={2}
          step={0.1}
        />
      </div>

      {/* Message history window size */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.categorize.historyWindow', 'Message History Window')}</Label>
        <Input
          type="number"
          value={state.message_history_window_size}
          onChange={(e) => updateField('message_history_window_size', Math.max(1, Number(e.target.value) || 1))}
          min={1}
          max={50}
        />
      </div>

      {/* Category definitions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.categorize.categories', 'Categories')}</Label>
          <Button variant="ghost" size="sm" onClick={addCategory}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        {state.categories.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {t('agents.forms.categorize.noCategories', 'No categories defined. Add categories for LLM classification.')}
          </p>
        )}

        {state.categories.map((cat, idx) => (
          <div key={idx} className="space-y-2 p-2 border rounded-md bg-muted/30">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t('agents.forms.categorize.categoryLabel', 'Category')} {idx + 1}
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeCategory(idx)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
            {/* Category name */}
            <Input
              value={cat.name}
              onChange={(e) => updateCategory(idx, { name: e.target.value })}
              placeholder={t('agents.forms.categorize.categoryName', 'Category name')}
              className="text-sm"
            />
            {/* Category description */}
            <Input
              value={cat.description}
              onChange={(e) => updateCategory(idx, { description: e.target.value })}
              placeholder={t('agents.forms.categorize.categoryDescription', 'Description of this category')}
              className="text-sm"
            />
            {/* Example queries (one per line) */}
            <Textarea
              value={cat.examples}
              onChange={(e) => updateCategory(idx, { examples: e.target.value })}
              placeholder={t('agents.forms.categorize.examplesPlaceholder', 'Example queries, one per line...')}
              className="text-xs min-h-[60px]"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
