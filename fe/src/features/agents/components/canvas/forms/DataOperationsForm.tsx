/**
 * @fileoverview Data Operations node configuration form.
 * Provides controls for object-level operations on arrays of dictionaries:
 * select_keys, filter_values, combine, append_or_update, remove_keys, rename_keys.
 *
 * @module features/agents/components/canvas/forms/DataOperationsForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { NodeFormProps } from './types'

/**
 * @description Supported data operation types matching the RAGFlow backend
 */
type DataOperation = 'select_keys' | 'filter_values' | 'combine' | 'append_or_update' | 'remove_keys' | 'rename_keys'

/**
 * @description Filter rule for the filter_values operation
 */
interface FilterRule {
  key: string
  operator: '=' | '!=' | 'contains' | 'start with' | 'end with'
  value: string
}

/**
 * @description Rename mapping for the rename_keys operation
 */
interface RenameMapping {
  old_key: string
  new_key: string
}

/**
 * @description Update entry for append_or_update operation
 */
interface UpdateEntry {
  key: string
  value: string
}

/**
 * @description Internal state shape for DataOperations form fields
 */
interface DataOperationsConfig {
  query: string[]
  operations: DataOperation
  select_keys: string[]
  filter_values: FilterRule[]
  updates: UpdateEntry[]
  remove_keys: string[]
  rename_keys: RenameMapping[]
}

/** @description Default configuration for a new DataOperations node */
const DEFAULTS: DataOperationsConfig = {
  query: [],
  operations: 'select_keys',
  select_keys: [],
  filter_values: [],
  updates: [],
  remove_keys: [],
  rename_keys: [],
}

/**
 * @description Configuration form for the Data Operations operator node.
 *   Operates on arrays of objects (dictionaries). Supports selecting specific
 *   keys, filtering by value conditions, combining objects, appending/updating
 *   fields, removing keys, and renaming keys.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Data Operations node configuration form
 */
export function DataOperationsForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<DataOperationsConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<DataOperationsConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<DataOperationsConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof DataOperationsConfig>(field: K, value: DataOperationsConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* Input variable references (comma-separated) */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.dataOperations.inputs', 'Input Variables')}</Label>
        <Input
          value={state.query.join(', ')}
          onChange={(e) => {
            // Parse comma-separated variable references
            const refs = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
            updateField('query', refs)
          }}
          placeholder={t('agents.forms.dataOperations.inputsPlaceholder', 'component@output, another@data')}
        />
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.dataOperations.inputsHint', 'Comma-separated variable refs pointing to arrays of objects')}
        </p>
      </div>

      {/* Operation type selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.dataOperations.operation', 'Operation')}</Label>
        <Select
          value={state.operations}
          onValueChange={(v: string) => updateField('operations', v as DataOperation)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="select_keys">{t('agents.forms.dataOperations.selectKeys', 'Select Keys')}</SelectItem>
            <SelectItem value="filter_values">{t('agents.forms.dataOperations.filterValues', 'Filter Values')}</SelectItem>
            <SelectItem value="combine">{t('agents.forms.dataOperations.combine', 'Combine')}</SelectItem>
            <SelectItem value="append_or_update">{t('agents.forms.dataOperations.appendOrUpdate', 'Append/Update')}</SelectItem>
            <SelectItem value="remove_keys">{t('agents.forms.dataOperations.removeKeys', 'Remove Keys')}</SelectItem>
            <SelectItem value="rename_keys">{t('agents.forms.dataOperations.renameKeys', 'Rename Keys')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Operation-specific parameters */}
      {state.operations === 'select_keys' && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.dataOperations.keys', 'Keys to Select')}</Label>
          <Input
            value={state.select_keys.join(', ')}
            onChange={(e) => {
              const keys = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              updateField('select_keys', keys)
            }}
            placeholder={t('agents.forms.dataOperations.keysPlaceholder', 'name, email, role')}
          />
        </div>
      )}

      {state.operations === 'remove_keys' && (
        <div className="space-y-1.5">
          <Label>{t('agents.forms.dataOperations.keysToRemove', 'Keys to Remove')}</Label>
          <Input
            value={state.remove_keys.join(', ')}
            onChange={(e) => {
              const keys = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              updateField('remove_keys', keys)
            }}
            placeholder={t('agents.forms.dataOperations.removeKeysPlaceholder', 'password, secret')}
          />
        </div>
      )}

      {state.operations === 'filter_values' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('agents.forms.dataOperations.filterRules', 'Filter Rules')}</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateField('filter_values', [...state.filter_values, { key: '', operator: '=', value: '' }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('common.add', 'Add')}
            </Button>
          </div>
          {state.filter_values.map((rule, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={rule.key}
                onChange={(e) => {
                  const next = state.filter_values.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r))
                  updateField('filter_values', next)
                }}
                placeholder={t('agents.forms.dataOperations.filterKey', 'Key')}
                className="flex-1 text-sm"
              />
              <Select
                value={rule.operator}
                onValueChange={(v: string) => {
                  const next = state.filter_values.map((r, i) => (i === idx ? { ...r, operator: v as FilterRule['operator'] } : r))
                  updateField('filter_values', next)
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="=">=</SelectItem>
                  <SelectItem value="!=">!=</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="start with">Starts With</SelectItem>
                  <SelectItem value="end with">Ends With</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={rule.value}
                onChange={(e) => {
                  const next = state.filter_values.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r))
                  updateField('filter_values', next)
                }}
                placeholder={t('agents.forms.dataOperations.filterValue', 'Value')}
                className="flex-1 text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => updateField('filter_values', state.filter_values.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {state.operations === 'append_or_update' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('agents.forms.dataOperations.updateEntries', 'Update Entries')}</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateField('updates', [...state.updates, { key: '', value: '' }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('common.add', 'Add')}
            </Button>
          </div>
          {state.updates.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={entry.key}
                onChange={(e) => {
                  const next = state.updates.map((u, i) => (i === idx ? { ...u, key: e.target.value } : u))
                  updateField('updates', next)
                }}
                placeholder={t('agents.forms.dataOperations.updateKey', 'Key')}
                className="flex-1 text-sm"
              />
              <Input
                value={entry.value}
                onChange={(e) => {
                  const next = state.updates.map((u, i) => (i === idx ? { ...u, value: e.target.value } : u))
                  updateField('updates', next)
                }}
                placeholder={t('agents.forms.dataOperations.updateValue', 'Value or {ref}')}
                className="flex-1 text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => updateField('updates', state.updates.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {state.operations === 'rename_keys' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('agents.forms.dataOperations.renameMappings', 'Rename Mappings')}</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateField('rename_keys', [...state.rename_keys, { old_key: '', new_key: '' }])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t('common.add', 'Add')}
            </Button>
          </div>
          {state.rename_keys.map((mapping, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={mapping.old_key}
                onChange={(e) => {
                  const next = state.rename_keys.map((m, i) => (i === idx ? { ...m, old_key: e.target.value } : m))
                  updateField('rename_keys', next)
                }}
                placeholder={t('agents.forms.dataOperations.oldKey', 'Old key')}
                className="flex-1 text-sm"
              />
              <span className="text-xs text-muted-foreground">-&gt;</span>
              <Input
                value={mapping.new_key}
                onChange={(e) => {
                  const next = state.rename_keys.map((m, i) => (i === idx ? { ...m, new_key: e.target.value } : m))
                  updateField('rename_keys', next)
                }}
                placeholder={t('agents.forms.dataOperations.newKey', 'New key')}
                className="flex-1 text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => updateField('rename_keys', state.rename_keys.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Combine operation has no additional params */}
      {state.operations === 'combine' && (
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.dataOperations.combineHint', 'Merges all input objects by combining matching keys into arrays.')}
        </p>
      )}
    </div>
  )
}
