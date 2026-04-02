/**
 * @fileoverview Create / Edit dialog for LLM Provider configuration.
 *
 * Renders a modal form with factory preset selection, model type filtering,
 * pre-defined model dropdowns, API key (masked), API base URL with
 * factory-specific placeholders, max tokens, default flag, and a vision
 * checkbox that sets the `vision` boolean on chat providers.
 *
 * @module features/llm-provider/components/ProviderFormDialog
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MODEL_TYPES } from '../types/llmProvider.types'
import { ModelType } from '@/constants'
import type {
  ModelProvider,
  CreateProviderDTO,
  UpdateProviderDTO,
  FactoryPreset,
  PresetModel,
} from '../types/llmProvider.types'

// ============================================================================
// Constants
// ============================================================================

/** Factory names available when no presets are loaded */
const FALLBACK_FACTORIES = [
  'OpenAI',
  'Azure-OpenAI',
  'Anthropic',
  'Gemini',
  'Ollama',
  'OpenAI-API-Compatible',
]

/** Default API base URL placeholders per factory */
const API_BASE_PLACEHOLDERS: Record<string, string> = {
  'OpenAI': 'https://api.openai.com/v1',
  'Azure-OpenAI': 'https://<resource>.openai.azure.com/openai/deployments/<deployment>',
  'Anthropic': 'https://api.anthropic.com',
  'Gemini': 'https://generativelanguage.googleapis.com/v1beta',
  'Ollama': 'http://localhost:11434',
  'OpenAI-API-Compatible': 'https://api.example.com/v1',
}

// ============================================================================
// Types
// ============================================================================

interface ProviderFormDialogProps {
  /** Whether the dialog is visible */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Callback fired on successful submit */
  onSubmit: (data: CreateProviderDTO | UpdateProviderDTO) => Promise<void>
  /** Existing provider for edit mode; null/undefined for create */
  provider?: ModelProvider | null
  /** Source provider to clone settings from (create mode with pre-populated fields) */
  cloningFrom?: ModelProvider | null
  /** Factory presets loaded from the API */
  presets?: FactoryPreset[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal dialog for creating or editing an LLM provider.
 * When model_type is "chat", an additional checkbox lets the user declare
 * vision support via the `vision` boolean field.
 *
 * @param props - Component props
 * @returns React element
 */
export function ProviderFormDialog({
  open,
  onClose,
  onSubmit,
  provider,
  cloningFrom,
  presets = [],
}: ProviderFormDialogProps) {
  const { t } = useTranslation()

  // Determine if we are editing an existing record
  const isEdit = !!provider

  // -- Form state ------------------------------------------------------------
  const [factoryName, setFactoryName] = useState('')
  const [modelType, setModelType] = useState(ModelType.CHAT)
  const [modelName, setModelName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [maxTokens, setMaxTokens] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  // Vision support checkbox — only relevant when modelType is "chat"
  const [supportsVision, setSupportsVision] = useState(false)

  // Password visibility toggle
  const [showKey, setShowKey] = useState(false)

  // Submission loading state
  const [saving, setSaving] = useState(false)

  // -- Derived: Build factory list from presets or fallback ------------------
  const factoryNames = presets.length > 0
    ? presets.map((p) => p.name)
    : FALLBACK_FACTORIES

  // Locate the selected factory preset
  const selectedPreset = presets.find((p) => p.name === factoryName)

  // Filter preset models by current model_type
  const availableModels: PresetModel[] = selectedPreset
    ? selectedPreset.models.filter((m) => m.model_type === modelType)
    : []

  // Determine whether to show a dropdown or free text for model name
  const useModelDropdown = availableModels.length > 0

  // Compute API base placeholder for the selected factory
  const apiBasePlaceholder = API_BASE_PLACEHOLDERS[factoryName] ?? t('llmProviders.apiBasePlaceholder')

  // -- Populate form when provider changes (edit or clone mode) --------------
  useEffect(() => {
    if (provider) {
      // Edit mode — populate from existing provider
      setFactoryName(provider.factory_name)
      setModelType(provider.model_type)
      setModelName(provider.model_name)
      // API key is masked; leave blank so user can optionally enter a new one
      setApiKey('')
      setApiBase(provider.api_base ?? '')
      setMaxTokens(provider.max_tokens != null ? String(provider.max_tokens) : '')
      setIsDefault(provider.is_default)
      setSupportsVision(provider.vision === true)
    } else if (cloningFrom) {
      // Clone mode — pre-populate from source provider with "(Copy)" suffix
      setFactoryName(cloningFrom.factory_name)
      setModelType(cloningFrom.model_type)
      setModelName(`${cloningFrom.model_name} (Copy)`)
      // API key is intentionally blank — user can enter a new key or leave empty
      setApiKey('')
      setApiBase(cloningFrom.api_base ?? '')
      setMaxTokens(cloningFrom.max_tokens != null ? String(cloningFrom.max_tokens) : '')
      setIsDefault(false)
      setSupportsVision(cloningFrom.vision === true)
    } else {
      // Create mode — reset to defaults
      setFactoryName('')
      setModelType(ModelType.CHAT)
      setModelName('')
      setApiKey('')
      setApiBase('')
      setMaxTokens('')
      setIsDefault(false)
      setSupportsVision(false)
    }
    setShowKey(false)
  }, [provider, cloningFrom, open])

  /**
   * Handle factory selection change.
   * Resets model name and auto-populates api_base placeholder.
   * @param value - Selected factory name
   */
  const handleFactoryChange = (value: string) => {
    setFactoryName(value)
    // Reset model name when factory changes since available models differ
    setModelName('')
    setMaxTokens('')
  }

  /**
   * Handle model type selection change.
   * Resets model name since available presets change per type.
   * @param value - Selected model type
   */
  const handleModelTypeChange = (value: string) => {
    setModelType(value)
    // Reset model name when type changes
    setModelName('')
    setMaxTokens('')
    // Clear vision checkbox when switching away from chat
    if (value !== ModelType.CHAT) {
      setSupportsVision(false)
    }
  }

  /**
   * Handle preset model selection from dropdown.
   * Auto-fills max_tokens from the preset.
   * @param value - Selected model name
   */
  const handlePresetModelSelect = (value: string) => {
    setModelName(value)
    // Auto-fill max_tokens from the preset model definition
    const presetModel = availableModels.find((m) => m.model_name === value)
    if (presetModel?.max_tokens != null) {
      setMaxTokens(String(presetModel.max_tokens))
    } else {
      setMaxTokens('')
    }
  }

  /**
   * Handle form submission — build DTO and delegate to parent.
   * Vision flag is included directly in the payload.
   */
  const handleSubmit = async () => {
    // Build the payload; only include api_key when the user actually typed one
    const data: CreateProviderDTO | UpdateProviderDTO = {
      factory_name: factoryName,
      model_type: modelType,
      model_name: modelName,
      api_base: apiBase || null,
      max_tokens: maxTokens ? Number(maxTokens) : null,
      is_default: isDefault,
      // Include vision flag for chat models
      vision: modelType === ModelType.CHAT ? supportsVision : false,
    }

    // Only send api_key when user has entered a value (avoids overwriting with blank)
    if (apiKey) {
      data.api_key = apiKey
    }

    setSaving(true)
    try {
      await onSubmit(data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Disable submit when required fields are missing
  const canSubmit = factoryName.trim() !== '' && modelName.trim() !== '' && !saving

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('llmProviders.editProvider') : t('llmProviders.addProvider')}
          </DialogTitle>
        </DialogHeader>

        {/* -- Form fields --------------------------------------------------- */}
        <div className="space-y-4 py-2">
          {/* Factory Name dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('llmProviders.factoryName')} <span className="text-red-500">*</span>
            </label>
            <select
              value={factoryName}
              onChange={(e) => handleFactoryChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('llmProviders.selectFactory')}</option>
              {factoryNames.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
              {/* Always include Custom as last option */}
              <option value="Custom">{t('llmProviders.customFactory')}</option>
            </select>
          </div>

          {/* Model Type dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('llmProviders.modelType')} <span className="text-red-500">*</span>
            </label>
            <select
              value={modelType}
              onChange={(e) => handleModelTypeChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {MODEL_TYPES.map((mt) => (
                <option key={mt} value={mt}>{t(`llmProviders.modelTypes.${mt}`)}</option>
              ))}
            </select>
          </div>

          {/* Model Name — dropdown for presets or free text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('llmProviders.modelName')} <span className="text-red-500">*</span>
            </label>
            {useModelDropdown ? (
              <>
                <select
                  value={modelName}
                  onChange={(e) => handlePresetModelSelect(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">{t('llmProviders.selectModel')}</option>
                  {availableModels.map((m) => (
                    <option key={m.model_name} value={m.model_name}>{m.model_name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('llmProviders.presetModels')}: {availableModels.length}
                </p>
              </>
            ) : (
              <>
                <Input
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder={t('llmProviders.customModel')}
                />
                {factoryName && factoryName !== 'Custom' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('llmProviders.noPresetModels')}
                  </p>
                )}
              </>
            )}
          </div>

          {/* API Key — password input with show/hide toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('llmProviders.apiKey')}
            </label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit ? t('llmProviders.apiKeyMaskedPlaceholder') : t('llmProviders.apiKeyPlaceholder')}
                className="pr-10"
              />
              {/* Toggle password visibility */}
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* API Base URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('llmProviders.apiBase')}
            </label>
            <Input
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder={apiBasePlaceholder}
            />
          </div>

          {/* Max Tokens */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('llmProviders.maxTokens')}
            </label>
            <Input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder={t('llmProviders.maxTokensPlaceholder')}
              min={0}
            />
          </div>

          {/* Is Default toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is-default"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="is-default" className="text-sm text-gray-700 dark:text-gray-300">
              {t('llmProviders.setAsDefault')}
            </label>
          </div>

          {/* Vision support checkbox — only visible when model_type is "chat" */}
          {modelType === ModelType.CHAT && (
            <div className="flex items-center gap-2 rounded-md bg-purple-50 dark:bg-purple-950/30 p-3 border border-purple-200 dark:border-purple-800">
              <input
                type="checkbox"
                id="supports-vision"
                checked={supportsVision}
                onChange={(e) => setSupportsVision(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <label htmlFor="supports-vision" className="text-sm text-purple-800 dark:text-purple-200">
                {t('llmProviders.supportsVision')}
              </label>
            </div>
          )}
        </div>

        {/* -- Footer -------------------------------------------------------- */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ProviderFormDialog
