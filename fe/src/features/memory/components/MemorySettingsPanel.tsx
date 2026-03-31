/**
 * @fileoverview Settings panel for memory pool configuration.
 * Provides form sections for general info, memory types, storage, extraction,
 * models, prompts, forgetting policy, and access control.
 *
 * @module features/memory/components/MemorySettingsPanel
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import type { Memory, UpdateMemoryDto } from '../types/memory.types'
import { MemoryType, hasMemoryType } from '../types/memory.types'
import type {
  MemoryStorageType,
  MemoryExtractionMode,
  MemoryPermission,
  MemoryScopeType,
} from '../types/memory.types'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the MemorySettingsPanel component
 */
interface MemorySettingsPanelProps {
  /** Current memory pool record to populate form defaults */
  memory: Memory
  /** Callback invoked with updated fields when user clicks Save */
  onSave: (data: UpdateMemoryDto) => void
}

/**
 * @description Internal form state matching all editable memory pool fields
 */
interface SettingsFormState {
  name: string
  description: string
  memory_type: number
  storage_type: MemoryStorageType
  extraction_mode: MemoryExtractionMode
  embd_id: string
  llm_id: string
  temperature: number
  system_prompt: string
  user_prompt: string
  memory_size: number
  forgetting_policy: string
  permission: MemoryPermission
  scope_type: MemoryScopeType
}

// ============================================================================
// Constants
// ============================================================================

/** @description Default system prompt for memory extraction */
const DEFAULT_SYSTEM_PROMPT = 'You are a memory extraction assistant. Extract structured knowledge from conversations.'

/** @description Default user prompt template for memory extraction */
const DEFAULT_USER_PROMPT = 'Extract key facts, procedures, and events from the following conversation:\n\n{{content}}'

/** @description Memory type checkbox entries */
const MEMORY_TYPE_OPTIONS = [
  { value: MemoryType.RAW, labelKey: 'memory.raw' },
  { value: MemoryType.SEMANTIC, labelKey: 'memory.semantic' },
  { value: MemoryType.EPISODIC, labelKey: 'memory.episodic' },
  { value: MemoryType.PROCEDURAL, labelKey: 'memory.procedural' },
] as const

/** @description Bytes in one megabyte for display conversion */
const BYTES_PER_MB = 1024 * 1024

// ============================================================================
// Component
// ============================================================================

/**
 * @description Settings form panel for editing memory pool configuration.
 * Includes sections for general, memory types, storage, extraction, models,
 * prompts, forgetting policy, and access control.
 * @param {MemorySettingsPanelProps} props - Memory data and save callback
 * @returns {JSX.Element} Rendered settings form
 */
export function MemorySettingsPanel({ memory, onSave }: MemorySettingsPanelProps) {
  const { t } = useTranslation()

  // Initialize form state from the memory record
  const [form, setForm] = useState<SettingsFormState>(() => ({
    name: memory.name,
    description: memory.description ?? '',
    memory_type: memory.memory_type,
    storage_type: memory.storage_type,
    extraction_mode: memory.extraction_mode,
    embd_id: memory.embd_id ?? '',
    llm_id: memory.llm_id ?? '',
    temperature: memory.temperature,
    system_prompt: memory.system_prompt ?? '',
    user_prompt: memory.user_prompt ?? '',
    memory_size: memory.memory_size,
    forgetting_policy: memory.forgetting_policy,
    permission: memory.permission,
    scope_type: memory.scope_type,
  }))

  // Sync form when memory prop changes (e.g., after refetch)
  useEffect(() => {
    setForm({
      name: memory.name,
      description: memory.description ?? '',
      memory_type: memory.memory_type,
      storage_type: memory.storage_type,
      extraction_mode: memory.extraction_mode,
      embd_id: memory.embd_id ?? '',
      llm_id: memory.llm_id ?? '',
      temperature: memory.temperature,
      system_prompt: memory.system_prompt ?? '',
      user_prompt: memory.user_prompt ?? '',
      memory_size: memory.memory_size,
      forgetting_policy: memory.forgetting_policy,
      permission: memory.permission,
      scope_type: memory.scope_type,
    })
  }, [memory])

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * @description Toggle a specific memory type bit in the bitmask using XOR
   * @param {number} typeValue - Bitmask value to toggle (1, 2, 4, or 8)
   */
  const toggleMemoryType = (typeValue: number) => {
    setForm((prev) => ({
      ...prev,
      memory_type: prev.memory_type ^ typeValue,
    }))
  }

  /**
   * @description Build the update DTO from form state and invoke onSave
   */
  const handleSave = () => {
    const desc = form.description.trim()
    const sysPrompt = form.system_prompt.trim()
    const usrPrompt = form.user_prompt.trim()
    const embdId = form.embd_id.trim()
    const llmId = form.llm_id.trim()

    const data: UpdateMemoryDto = {
      name: form.name.trim(),
      memory_type: form.memory_type,
      storage_type: form.storage_type,
      extraction_mode: form.extraction_mode,
      temperature: form.temperature,
      memory_size: form.memory_size,
      permission: form.permission,
      scope_type: form.scope_type,
      // Use spread pattern for optional fields to satisfy exactOptionalPropertyTypes
      ...(desc ? { description: desc } : {}),
      ...(sysPrompt ? { system_prompt: sysPrompt } : {}),
      ...(usrPrompt ? { user_prompt: usrPrompt } : {}),
      ...(embdId ? { embd_id: embdId } : {}),
      ...(llmId ? { llm_id: llmId } : {}),
    }
    onSave(data)
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Section A: General */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
          {t('common.general', { defaultValue: 'General' })}
        </h3>
        <div className="space-y-2">
          <Label>{t('memory.name')}</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            className="dark:bg-slate-800 dark:border-slate-700"
          />
        </div>
        <div className="space-y-2">
          <Label>{t('memory.description')}</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            rows={2}
            className="dark:bg-slate-800 dark:border-slate-700"
          />
        </div>
      </section>

      {/* Section B: Memory Types (bitmask checkboxes) */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
          {t('memory.memoryType')}
        </h3>
        <div className="flex flex-wrap gap-3">
          {MEMORY_TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={hasMemoryType(form.memory_type, option.value)}
                onChange={() => toggleMemoryType(option.value)}
                className="rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-slate-700 dark:text-slate-300">{t(option.labelKey)}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Section C: Storage (table/graph radio) */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
          {t('memory.storageType')}
        </h3>
        <div className="flex gap-4">
          {(['table', 'graph'] as const).map((val) => (
            <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="settings_storage_type"
                checked={form.storage_type === val}
                onChange={() => setForm((prev) => ({ ...prev, storage_type: val }))}
              />
              <span className="text-slate-700 dark:text-slate-300">{t(`memory.${val}`)}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Section D: Extraction mode (batch/realtime radio) */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
          {t('memory.extractionMode')}
        </h3>
        <div className="flex gap-4">
          {(['batch', 'realtime'] as const).map((val) => (
            <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="settings_extraction_mode"
                checked={form.extraction_mode === val}
                onChange={() => setForm((prev) => ({ ...prev, extraction_mode: val }))}
              />
              <span className="text-slate-700 dark:text-slate-300">{t(`memory.${val}`)}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Section E: Models (embedding + LLM + temperature) */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
          {t('common.models', { defaultValue: 'Models' })}
        </h3>

        {/* Embedding model ID input (free-text; LLM provider list integration deferred) */}
        <div className="space-y-2">
          <Label>{t('memory.embeddingModel')}</Label>
          <Input
            value={form.embd_id}
            onChange={(e) => setForm((prev) => ({ ...prev, embd_id: e.target.value }))}
            placeholder={t('common.default', { defaultValue: 'Default' })}
            className="dark:bg-slate-800 dark:border-slate-700"
          />
        </div>

        {/* LLM model ID input */}
        <div className="space-y-2">
          <Label>{t('memory.llmModel')}</Label>
          <Input
            value={form.llm_id}
            onChange={(e) => setForm((prev) => ({ ...prev, llm_id: e.target.value }))}
            placeholder={t('common.default', { defaultValue: 'Default' })}
            className="dark:bg-slate-800 dark:border-slate-700"
          />
        </div>

        {/* Temperature slider 0-2 */}
        <div className="space-y-2">
          <Label>
            {t('common.temperature', { defaultValue: 'Temperature' })}:{' '}
            <span className="font-normal text-slate-500">{form.temperature.toFixed(1)}</span>
          </Label>
          <Slider
            value={[form.temperature]}
            min={0}
            max={2}
            step={0.1}
            onValueChange={(values: number[]) => {
              const val = values[0]
              if (val !== undefined) setForm((prev) => ({ ...prev, temperature: val }))
            }}
            className="w-full"
          />
        </div>
      </section>

      {/* Section F: Prompts (system + user with reset buttons) */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
          {t('common.prompts', { defaultValue: 'Prompts' })}
        </h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('memory.systemPrompt')}</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setForm((prev) => ({ ...prev, system_prompt: DEFAULT_SYSTEM_PROMPT }))}
            >
              <RotateCcw size={12} className="mr-1" />
              {t('memory.resetPrompt')}
            </Button>
          </div>
          <Textarea
            value={form.system_prompt}
            onChange={(e) => setForm((prev) => ({ ...prev, system_prompt: e.target.value }))}
            rows={3}
            className="dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t('memory.userPrompt')}</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setForm((prev) => ({ ...prev, user_prompt: DEFAULT_USER_PROMPT }))}
            >
              <RotateCcw size={12} className="mr-1" />
              {t('memory.resetPrompt')}
            </Button>
          </div>
          <Textarea
            value={form.user_prompt}
            onChange={(e) => setForm((prev) => ({ ...prev, user_prompt: e.target.value }))}
            rows={4}
            className="dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
          />
        </div>
      </section>

      {/* Section G: Forgetting */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
          {t('memory.forgettingPolicy')}
        </h3>

        <div className="space-y-2">
          <Label>{t('memory.memorySize')}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={Math.round(form.memory_size / BYTES_PER_MB)}
              onChange={(e) => {
                const mb = Math.max(0, Number(e.target.value) || 0)
                setForm((prev) => ({ ...prev, memory_size: mb * BYTES_PER_MB }))
              }}
              className="w-32 dark:bg-slate-800 dark:border-slate-700"
            />
            <span className="text-sm text-slate-500 dark:text-slate-400">MB</span>
          </div>
        </div>

        {/* FIFO is the only supported policy (display-only) */}
        <div className="space-y-2">
          <Label>{t('memory.forgettingPolicy')}</Label>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            FIFO ({t('common.firstInFirstOut', { defaultValue: 'First In, First Out' })})
          </p>
        </div>
      </section>

      {/* Section H: Access control */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
          {t('common.access', { defaultValue: 'Access' })}
        </h3>

        {/* Permission radio */}
        <div className="space-y-2">
          <Label>{t('memory.permission')}</Label>
          <div className="flex gap-4">
            {(['me', 'team'] as const).map((val) => (
              <label key={val} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="settings_permission"
                  checked={form.permission === val}
                  onChange={() => setForm((prev) => ({ ...prev, permission: val }))}
                />
                <span className="text-slate-700 dark:text-slate-300">
                  {val === 'me' ? t('memory.permMe') : t('memory.permTeam')}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Scope type select */}
        <div className="space-y-2">
          <Label>{t('memory.scopeType')}</Label>
          <Select
            value={form.scope_type}
            onValueChange={(value: string) => setForm((prev) => ({ ...prev, scope_type: value as MemoryScopeType }))}
          >
            <SelectTrigger className="w-48 dark:bg-slate-800 dark:border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">{t('memory.scopeUser')}</SelectItem>
              <SelectItem value="agent">{t('memory.scopeAgent')}</SelectItem>
              <SelectItem value="team">{t('memory.scopeTeam')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Save button */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={handleSave} disabled={!form.name.trim()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
