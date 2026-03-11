/**
 * @fileoverview Create / Edit dialog for LLM Provider configuration.
 *
 * Renders a modal form with factory preset selection, model type filtering,
 * pre-defined model dropdowns, API key (masked), API base URL with
 * factory-specific placeholders, max tokens, default flag, and a vision
 * checkbox that auto-manages an image2text sibling provider.
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
import {
  createProvider,
  updateProvider,
  deleteProvider,
} from '../api/llmProviderService'
import { MODEL_TYPES } from '../types/llmProvider.types'
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
  /** Factory presets loaded from the API */
  presets?: FactoryPreset[]
  /** All current providers — used to look up vision siblings */
  allProviders?: ModelProvider[]
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Find an image2text sibling provider that shares the same factory and model name.
 *
 * @param factoryName - Factory name to match
 * @param modelName - Model name to match
 * @param allProviders - Full list of active providers
 * @returns The sibling provider or undefined
 */
function findVisionSibling(
  factoryName: string,
  modelName: string,
  allProviders: ModelProvider[]
): ModelProvider | undefined {
  return allProviders.find(
    (p) =>
      p.model_type === 'image2text' &&
      p.factory_name === factoryName &&
      p.model_name === modelName
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal dialog for creating or editing an LLM provider.
 * When model_type is "chat", an additional checkbox lets the user declare
 * vision support, which auto-manages a paired image2text provider record.
 *
 * @param props - Component props
 * @returns React element
 */
export function ProviderFormDialog({
  open,
  onClose,
  onSubmit,
  provider,
  presets = [],
  allProviders = [],
}: ProviderFormDialogProps) {
  const { t } = useTranslation()

  // Determine if we are editing an existing record
  const isEdit = !!provider

  // -- Form state ------------------------------------------------------------
  const [factoryName, setFactoryName] = useState('')
  const [modelType, setModelType] = useState('chat')
  const [modelName, setModelName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiBase, setApiBase] = useState('')
  const [maxTokens, setMaxTokens] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  // Vision (image2text) support checkbox — only relevant when modelType is "chat"
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

  // -- Populate form when provider changes (edit mode) -----------------------
  useEffect(() => {
    if (provider) {
      setFactoryName(provider.factory_name)
      setModelType(provider.model_type)
      setModelName(provider.model_name)
      // API key is masked; leave blank so user can optionally enter a new one
      setApiKey('')
      setApiBase(provider.api_base ?? '')
      setMaxTokens(provider.max_tokens != null ? String(provider.max_tokens) : '')
      setIsDefault(provider.is_default)

      // Check if a vision sibling exists for this chat provider
      if (provider.model_type === 'chat') {
        const sibling = findVisionSibling(provider.factory_name, provider.model_name, allProviders)
        setSupportsVision(!!sibling)
      } else {
        setSupportsVision(false)
      }
    } else {
      // Reset to defaults for create mode
      setFactoryName('')
      setModelType('chat')
      setModelName('')
      setApiKey('')
      setApiBase('')
      setMaxTokens('')
      setIsDefault(false)
      setSupportsVision(false)
    }
    setShowKey(false)
  }, [provider, open, allProviders])

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
    if (value !== 'chat') {
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
   * Handle form submission — build DTO, delegate to parent, and manage
   * the image2text sibling when vision is toggled.
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
    }

    // Only send api_key when user has entered a value (avoids overwriting with blank)
    if (apiKey) {
      data.api_key = apiKey
    }

    setSaving(true)
    try {
      // Submit the primary provider record
      await onSubmit(data)

      // -- Manage image2text sibling for chat providers ----------------------
      if (modelType === 'chat') {
        const existingSibling = findVisionSibling(factoryName, modelName, allProviders)

        if (supportsVision && !existingSibling) {
          // Create a new image2text provider with the same credentials
          const siblingData: CreateProviderDTO = {
            factory_name: factoryName,
            model_type: 'image2text',
            model_name: modelName,
            api_base: apiBase || null,
            max_tokens: maxTokens ? Number(maxTokens) : null,
            is_default: false,
          }
          if (apiKey) {
            siblingData.api_key = apiKey
          }
          await createProvider(siblingData)
        } else if (supportsVision && existingSibling) {
          // Update the existing image2text sibling to keep credentials in sync
          const siblingUpdate: UpdateProviderDTO = {
            factory_name: factoryName,
            model_name: modelName,
            api_base: apiBase || null,
            max_tokens: maxTokens ? Number(maxTokens) : null,
          }
          if (apiKey) {
            siblingUpdate.api_key = apiKey
          }
          await updateProvider(existingSibling.id, siblingUpdate)
        } else if (!supportsVision && existingSibling) {
          // Vision unchecked but sibling exists — remove it
          await deleteProvider(existingSibling.id)
        }
      }

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
                <option key={mt} value={mt}>{t(`llmProviders.${mt}`)}</option>
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
                placeholder={isEdit ? '***' : t('llmProviders.apiKeyPlaceholder')}
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
              placeholder="e.g., 4096"
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
          {modelType === 'chat' && (
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
