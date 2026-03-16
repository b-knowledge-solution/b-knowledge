/**
 * @fileoverview Dialog configuration panel for chat settings.
 * Allows selecting knowledge bases, LLM model, tuning parameters,
 * and managing custom prompt variables.
 * @module features/chat/components/ChatAssistantConfig
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2 } from 'lucide-react'
import { Switch } from '@headlessui/react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import ChatVariableForm from './ChatVariableForm'
import type { ChatAssistant, CreateAssistantPayload, PromptConfig, PromptVariable } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatAssistantConfigProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Callback when configuration is saved */
  onSave: (data: CreateAssistantPayload) => void
  /** Existing dialog data for editing (null for new) */
  dialog?: ChatAssistant | null
  /** Available datasets for selection */
  datasets?: { id: string; name: string }[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Configuration dialog for creating or editing a chat assistant.
 * Includes knowledge base selection, LLM model, system prompt, tuning sliders,
 * and a custom variables section.
 *
 * @param {ChatAssistantConfigProps} props - Component properties
 * @returns {JSX.Element} The rendered configuration dialog
 */
function ChatAssistantConfig({
  open,
  onClose,
  onSave,
  dialog,
  datasets = [],
}: ChatAssistantConfigProps) {
  const { t } = useTranslation()

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedKbs, setSelectedKbs] = useState<string[]>([])
  const [llmId, setLlmId] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [prologue, setPrologue] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [topK, setTopK] = useState(5)
  const [topN, setTopN] = useState(3)
  const [isPublic, setIsPublic] = useState(false)
  const [variables, setVariables] = useState<PromptVariable[]>([])

  // Populate form when editing an existing dialog
  useEffect(() => {
    if (dialog) {
      setName(dialog.name)
      setDescription(dialog.description || '')
      setSelectedKbs(dialog.kb_ids)
      setLlmId(dialog.llm_id || '')
      setIsPublic(dialog.is_public ?? false)
      setSystemPrompt(dialog.prompt_config?.system || '')
      setPrologue(dialog.prompt_config?.prologue || '')
      setTemperature(dialog.prompt_config?.temperature ?? 0.7)
      setTopK(dialog.prompt_config?.top_k ?? 5)
      setTopN(dialog.prompt_config?.top_n ?? 3)
      setVariables(dialog.prompt_config?.variables ?? [])
    } else {
      setName('')
      setDescription('')
      setSelectedKbs([])
      setLlmId('')
      setIsPublic(false)
      setSystemPrompt('')
      setPrologue('')
      setTemperature(0.7)
      setTopK(5)
      setTopN(3)
      setVariables([])
    }
  }, [dialog, open])

  /**
   * Toggle a knowledge base in the selection.
   * @param kbId - Knowledge base ID to toggle
   */
  const toggleKb = (kbId: string) => {
    setSelectedKbs((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId],
    )
  }

  /**
   * Handle form save.
   */
  const handleSave = () => {
    if (!name.trim()) return

    const promptConfig: Partial<PromptConfig> = {
      system: systemPrompt || undefined,
      prologue: prologue || undefined,
      temperature,
      top_k: topK,
      top_n: topN,
      variables: variables.filter((v) => v.key.trim().length > 0).length > 0
        ? variables.filter((v) => v.key.trim().length > 0)
        : undefined,
    }

    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      kb_ids: selectedKbs,
      llm_id: llmId || undefined,
      is_public: isPublic,
      prompt_config: promptConfig,
    })

    onClose()
  }

  const dialogTitle = dialog ? t('chat.editDialog') : t('chat.createDialog')

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Settings icon hint */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Settings2 className="h-4 w-4" />
            <span>{dialogTitle}</span>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('common.name')} *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('chat.dialogNamePlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('common.description')}
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('chat.dialogDescriptionPlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('chatAdmin.isPublic')}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('chatAdmin.publicDesc')}
              </p>
            </div>
            <Switch
              checked={isPublic}
              onChange={setIsPublic}
              className={`${isPublic ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'} relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/30`}
            >
              <span
                className={`${isPublic ? 'translate-x-5' : 'translate-x-0.5'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out mt-0.5`}
              />
            </Switch>
          </div>

          {/* Knowledge bases multi-select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('chat.knowledgeBases')}
            </label>
            <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
              {datasets.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-1">
                  {t('chat.noDatasets')}
                </p>
              ) : (
                datasets.map((ds) => (
                  <label
                    key={ds.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKbs.includes(ds.id)}
                      onChange={() => toggleKb(ds.id)}
                      className="rounded border-slate-300 dark:border-slate-600"
                    />
                    <span>{ds.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* LLM model */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('chat.llmModel')}
            </label>
            <input
              value={llmId}
              onChange={(e) => setLlmId(e.target.value)}
              placeholder={t('chat.llmModelPlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* System prompt */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('chat.systemPrompt')}
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('chat.systemPromptPlaceholder')}
              className="w-full min-h-[80px] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
            />
          </div>

          {/* Welcome message (prologue) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('chat.welcomeMessage')}
            </label>
            <input
              value={prologue}
              onChange={(e) => setPrologue(e.target.value)}
              placeholder={t('chat.welcomeMessagePlaceholder')}
              className="w-full h-9 px-3 text-sm rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {/* Temperature slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('chat.temperature')}
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">{temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          {/* Top K slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('chat.topK')}
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">{topK}</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          {/* Top N slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('chat.topN')}
              </label>
              <span className="text-xs text-slate-500 dark:text-slate-400">{topN}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>

          {/* Separator before Variables section */}
          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Custom Prompt Variables section */}
          <ChatVariableForm value={variables} onChange={setVariables} />
        </div>
        <DialogFooter>
          <button
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleSave}
            disabled={!name.trim()}
          >
            {t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ChatAssistantConfig
