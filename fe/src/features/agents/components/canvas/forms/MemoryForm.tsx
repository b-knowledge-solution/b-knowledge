/**
 * @fileoverview Memory operator node configuration form for the agent canvas.
 * Supports both read and write modes with pool selection, search parameters,
 * and message type configuration.
 *
 * @module features/agents/components/canvas/forms/MemoryForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMemories } from '@/features/memory/api/memoryQueries'
import type { NodeFormProps } from './types'

/**
 * @description Internal state shape for Memory operator form fields
 */
interface MemoryConfig {
  operation: 'read' | 'write'
  memory_id: string
  top_k: number
  vector_weight: number
  message_type: number
}

/** @description Default configuration for a new Memory operator node */
const DEFAULTS: MemoryConfig = {
  operation: 'read',
  memory_id: '',
  top_k: 5,
  vector_weight: 0.7,
  message_type: 1,
}

/**
 * @description Configuration form for the Memory operator node (read and write modes).
 *   Allows selecting a memory pool, configuring search parameters for read mode,
 *   and choosing message type for write mode.
 *   Uses useMemories() from the memory feature API for pool selection.
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Memory operator node configuration form
 */
export function MemoryForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()
  const { data: memories } = useMemories()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<MemoryConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<MemoryConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<MemoryConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof MemoryConfig>(field: K, value: MemoryConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  return (
    <div className="space-y-4">
      {/* Operation mode selector: read or write */}
      <div className="space-y-1.5">
        <Label>{t('agents.memoryOperator.operationMode', 'Operation')}</Label>
        <Select
          value={state.operation}
          onValueChange={(v: string) => updateField('operation', v as MemoryConfig['operation'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="read">{t('agents.memoryOperator.read', 'Read')}</SelectItem>
            <SelectItem value="write">{t('agents.memoryOperator.write', 'Write')}</SelectItem>
          </SelectContent>
        </Select>
        {/* Description text explaining what the current mode does */}
        <p className="text-xs text-muted-foreground">
          {state.operation === 'read'
            ? t('agents.memoryOperator.readDescription', 'Retrieves relevant memories from the selected pool using hybrid search')
            : t('agents.memoryOperator.writeDescription', 'Stores content as a new memory in the selected pool')}
        </p>
      </div>

      {/* Memory pool selector populated from useMemories() hook */}
      <div className="space-y-1.5">
        <Label>{t('agents.memoryOperator.selectPool', 'Select Memory Pool')}</Label>
        <Select
          value={state.memory_id}
          onValueChange={(v: string) => updateField('memory_id', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('agents.memoryOperator.selectPool', 'Select Memory Pool')} />
          </SelectTrigger>
          <SelectContent>
            {memories && memories.length > 0 ? (
              memories.map((pool) => (
                <SelectItem key={pool.id} value={pool.id}>
                  {/* Show pool name with storage type badge */}
                  {pool.name} ({pool.storage_type})
                </SelectItem>
              ))
            ) : (
              <SelectItem value="" disabled>
                {t('agents.memoryOperator.noPoolsAvailable', 'No memory pools available')}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Read mode specific fields */}
      {state.operation === 'read' && (
        <>
          {/* Top-K results input */}
          <div className="space-y-1.5">
            <Label>{t('agents.memoryOperator.topK', 'Top K Results')}</Label>
            <Input
              type="number"
              value={state.top_k}
              onChange={(e) => updateField('top_k', Math.max(1, Math.min(20, Number(e.target.value) || 5)))}
              min={1}
              max={20}
            />
          </div>

          {/* Vector weight slider for hybrid search balance */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('agents.memoryOperator.vectorWeight', 'Vector Weight')}</Label>
              <span className="text-xs text-muted-foreground">{state.vector_weight.toFixed(2)}</span>
            </div>
            <Slider
              value={[state.vector_weight]}
              onValueChange={([v]: number[]) => updateField('vector_weight', v!)}
              min={0}
              max={1}
              step={0.05}
            />
          </div>
        </>
      )}

      {/* Write mode specific fields */}
      {state.operation === 'write' && (
        <div className="space-y-1.5">
          <Label>{t('agents.memoryOperator.messageType', 'Message Type')}</Label>
          <Select
            value={String(state.message_type)}
            onValueChange={(v: string) => updateField('message_type', Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">{t('memory.raw', 'Raw')}</SelectItem>
              <SelectItem value="2">{t('memory.semantic', 'Semantic')}</SelectItem>
              <SelectItem value="4">{t('memory.episodic', 'Episodic')}</SelectItem>
              <SelectItem value="8">{t('memory.procedural', 'Procedural')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
