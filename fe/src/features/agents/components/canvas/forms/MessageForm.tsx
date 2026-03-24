/**
 * @fileoverview Message node configuration form.
 * Provides controls for static message text with variable interpolation,
 * streaming toggle, and output format selection.
 *
 * @module features/agents/components/canvas/forms/MessageForm
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
 * @description Internal state shape for Message form fields
 */
interface MessageConfig {
  content: string[]
  stream: boolean
  output_format: string
}

/** @description Default configuration for a new Message node */
const DEFAULTS: MessageConfig = {
  content: [''],
  stream: true,
  output_format: '',
}

/**
 * @description Configuration form for the Message operator node.
 *   Allows defining one or more static message templates with {variable}
 *   interpolation syntax. When multiple messages are defined, one is chosen
 *   at random. Supports streaming output and format conversion (markdown,
 *   HTML, PDF, DOCX, XLSX).
 * @param {NodeFormProps} props - Node ID, current config, and update callback
 * @returns {JSX.Element} Message node configuration form
 */
export function MessageForm({ config, onUpdate }: NodeFormProps) {
  const { t } = useTranslation()

  // Initialize local state from node config, falling back to defaults
  const [state, setState] = useState<MessageConfig>(() => ({
    ...DEFAULTS,
    ...(config as Partial<MessageConfig>),
  }))

  // Re-sync local state when config prop changes
  useEffect(() => {
    setState((prev) => ({ ...prev, ...(config as Partial<MessageConfig>) }))
  }, [config])

  /**
   * @description Updates a single field and propagates change to canvas store
   */
  const updateField = <K extends keyof MessageConfig>(field: K, value: MessageConfig[K]) => {
    const next = { ...state, [field]: value }
    setState(next)
    onUpdate({ config: next })
  }

  /**
   * @description Adds a new empty message variant
   */
  const addMessage = () => {
    updateField('content', [...state.content, ''])
  }

  /**
   * @description Updates a message variant at the given index
   */
  const updateMessage = (index: number, value: string) => {
    const next = state.content.map((m, i) => (i === index ? value : m))
    updateField('content', next)
  }

  /**
   * @description Removes a message variant at the given index
   */
  const removeMessage = (index: number) => {
    // Ensure at least one message remains
    if (state.content.length <= 1) return
    const next = state.content.filter((_, i) => i !== index)
    updateField('content', next)
  }

  return (
    <div className="space-y-4">
      {/* Message content variants */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('agents.forms.message.content', 'Message Content')}</Label>
          <Button variant="ghost" size="sm" onClick={addMessage}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('common.add', 'Add')}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t('agents.forms.message.contentHint', 'Use {variable_name} for interpolation. Multiple messages = random selection.')}
        </p>

        {state.content.map((msg, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              {t('agents.forms.message.variant', 'Variant')} {idx + 1}
              {state.content.length > 1 && (
                <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeMessage(idx)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>
            <Textarea
              value={msg}
              onChange={(e) => updateMessage(idx, e.target.value)}
              placeholder={t('agents.forms.message.placeholder', 'Enter message template...')}
              className="min-h-[80px]"
            />
          </div>
        ))}
      </div>

      {/* Streaming toggle */}
      <div className="flex items-center justify-between">
        <Label>{t('agents.forms.message.stream', 'Stream Output')}</Label>
        <Switch
          checked={state.stream}
          onCheckedChange={(v: boolean) => updateField('stream', v)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('agents.forms.message.streamHint', 'Stream message content token-by-token to the user')}
      </p>

      {/* Output format selector */}
      <div className="space-y-1.5">
        <Label>{t('agents.forms.message.outputFormat', 'Output Format')}</Label>
        <Select
          value={state.output_format}
          onValueChange={(v: string) => updateField('output_format', v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('agents.forms.message.noConversion', 'None (plain text)')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('agents.forms.message.none', 'None')}</SelectItem>
            <SelectItem value="markdown">Markdown</SelectItem>
            <SelectItem value="html">HTML</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="docx">DOCX</SelectItem>
            <SelectItem value="xlsx">XLSX</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t('agents.forms.message.outputFormatHint', 'Optionally convert output to a downloadable file format')}
        </p>
      </div>
    </div>
  )
}
