/**
 * @fileoverview Dialog configuration panel for chat settings.
 * Allows selecting knowledge bases, LLM model, and tuning parameters.
 * @module features/ai/components/ChatDialogConfig
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { ChatDialog, CreateDialogPayload, PromptConfig } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatDialogConfigProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Callback when configuration is saved */
  onSave: (data: CreateDialogPayload) => void
  /** Existing dialog data for editing (null for new) */
  dialog?: ChatDialog | null
  /** Available datasets for selection */
  datasets?: { id: string; name: string }[]
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Configuration dialog for creating or editing a chat assistant.
 * Includes knowledge base selection, LLM model, system prompt, and tuning sliders.
 *
 * @param {ChatDialogConfigProps} props - Component properties
 * @returns {JSX.Element} The rendered configuration dialog
 */
function ChatDialogConfig({
  open,
  onClose,
  onSave,
  dialog,
  datasets = [],
}: ChatDialogConfigProps) {
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
    } else {
      // Reset for new dialog
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

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            {dialog ? t('chat.editDialog') : t('chat.createDialog')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>{t('common.name')} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('chat.dialogNamePlaceholder')}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>{t('common.description')}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('chat.dialogDescriptionPlaceholder')}
            />
          </div>

          {/* Public toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('chatAdmin.isPublic')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('chatAdmin.publicDesc')}
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          {/* Knowledge bases multi-select */}
          <div className="space-y-1.5">
            <Label>{t('chat.knowledgeBases')}</Label>
            <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
              {datasets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">
                  {t('chat.noDatasets')}
                </p>
              ) : (
                datasets.map((ds) => (
                  <label
                    key={ds.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKbs.includes(ds.id)}
                      onChange={() => toggleKb(ds.id)}
                      className="rounded border-input"
                    />
                    <span>{ds.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* LLM model */}
          <div className="space-y-1.5">
            <Label>{t('chat.llmModel')}</Label>
            <Input
              value={llmId}
              onChange={(e) => setLlmId(e.target.value)}
              placeholder={t('chat.llmModelPlaceholder')}
            />
          </div>

          {/* System prompt */}
          <div className="space-y-1.5">
            <Label>{t('chat.systemPrompt')}</Label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={t('chat.systemPromptPlaceholder')}
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>

          {/* Welcome message (prologue) */}
          <div className="space-y-1.5">
            <Label>{t('chat.welcomeMessage')}</Label>
            <Input
              value={prologue}
              onChange={(e) => setPrologue(e.target.value)}
              placeholder={t('chat.welcomeMessagePlaceholder')}
            />
          </div>

          {/* Temperature slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('chat.temperature')}</Label>
              <span className="text-xs text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Top K slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('chat.topK')}</Label>
              <span className="text-xs text-muted-foreground">{topK}</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          {/* Top N slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t('chat.topN')}</Label>
              <span className="text-xs text-muted-foreground">{topN}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={topN}
              onChange={(e) => setTopN(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ChatDialogConfig
