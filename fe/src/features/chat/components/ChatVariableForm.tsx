/**
 * @fileoverview Admin form for configuring custom prompt variables.
 * Renders a dynamic table where admins can add/remove/edit variable definitions.
 * @module features/chat/components/ChatVariableForm
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Switch } from '@headlessui/react'
import type { PromptVariable } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatVariableFormProps {
  /** Current variable definitions */
  value: PromptVariable[]
  /** Callback when variables change */
  onChange: (vars: PromptVariable[]) => void
}

// ============================================================================
// Helpers
// ============================================================================

/** Regex for valid variable key: starts with letter or underscore, then alphanumeric/underscore */
const VARIABLE_KEY_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * Create a new empty variable with defaults.
 * @returns A fresh PromptVariable object
 */
function createEmptyVariable(): PromptVariable {
  return {
    key: '',
    description: '',
    optional: false,
    default_value: '',
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Admin configuration form for custom prompt variables.
 * Renders a table with columns: variable name (code format), display label,
 * required toggle, and default value. Supports inline editing and add/remove rows.
 *
 * @param {ChatVariableFormProps} props - Component properties
 * @returns {JSX.Element} The rendered variable form
 */
function ChatVariableForm({ value, onChange }: ChatVariableFormProps) {
  const { t } = useTranslation()
  const [keyErrors, setKeyErrors] = useState<Record<number, string>>({})

  /**
   * Add a new empty variable row.
   */
  const handleAdd = () => {
    onChange([...value, createEmptyVariable()])
  }

  /**
   * Remove a variable row by index.
   * @param index - Row index to remove
   */
  const handleRemove = (index: number) => {
    const next = value.filter((_, i) => i !== index)
    onChange(next)
    const nextErrors = { ...keyErrors }
    delete nextErrors[index]
    setKeyErrors(nextErrors)
  }

  /**
   * Update a field on a specific variable row.
   * @param index - Row index
   * @param field - Field name to update
   * @param fieldValue - New value for the field
   */
  const handleFieldChange = (
    index: number,
    field: keyof PromptVariable,
    fieldValue: string | boolean,
  ) => {
    const next = value.map((v, i) => {
      if (i !== index) return v
      return { ...v, [field]: fieldValue }
    })

    // Validate key format on key changes
    if (field === 'key') {
      const key = fieldValue as string
      const nextErrors = { ...keyErrors }
      if (key && !VARIABLE_KEY_REGEX.test(key)) {
        nextErrors[index] = t('chat.variableKeyInvalid')
      } else {
        delete nextErrors[index]
      }
      setKeyErrors(nextErrors)
    }

    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {t('chat.variables')}
        </span>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
        >
          <Plus className="h-3 w-3" />
          {t('common.add')}
        </button>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
          {t('chat.noVariables')}
        </p>
      ) : (
        <div className="space-y-2">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_60px_1fr_32px] gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 px-1">
            <span>{t('chat.variableKey')}</span>
            <span>{t('common.description')}</span>
            <span>{t('chat.optional')}</span>
            <span>{t('chat.defaultValue')}</span>
            <span />
          </div>

          {/* Variable rows */}
          {value.map((variable, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_1fr_60px_1fr_32px] gap-2 items-start"
            >
              {/* Variable key */}
              <div>
                <input
                  value={variable.key}
                  onChange={(e) => handleFieldChange(index, 'key', e.target.value)}
                  placeholder={t('chat.variableKeyPlaceholder')}
                  className="w-full h-8 px-2 text-xs font-mono rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                {keyErrors[index] && (
                  <p className="text-[10px] text-red-500 mt-0.5">{keyErrors[index]}</p>
                )}
              </div>

              {/* Description */}
              <input
                value={variable.description ?? ''}
                onChange={(e) => handleFieldChange(index, 'description', e.target.value)}
                placeholder={t('chat.variableDescPlaceholder')}
                className="w-full h-8 px-2 text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />

              {/* Optional toggle */}
              <div className="flex items-center justify-center h-8">
                <Switch
                  checked={variable.optional}
                  onChange={(checked: boolean) => handleFieldChange(index, 'optional', checked)}
                  className={`${variable.optional ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'} relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/30`}
                >
                  <span
                    className={`${variable.optional ? 'translate-x-4' : 'translate-x-0.5'} pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out mt-0.5`}
                  />
                </Switch>
              </div>

              {/* Default value */}
              <input
                value={variable.default_value ?? ''}
                onChange={(e) => handleFieldChange(index, 'default_value', e.target.value)}
                placeholder={t('chat.defaultValuePlaceholder')}
                className="w-full h-8 px-2 text-xs rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />

              {/* Remove button */}
              <button
                type="button"
                className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                onClick={() => handleRemove(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ChatVariableForm
