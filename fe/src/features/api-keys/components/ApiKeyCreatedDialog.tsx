/**
 * @fileoverview Dialog shown after successfully creating an API key.
 *   Displays the one-time plaintext key with a copy button and example usage.
 * @module features/api-keys/components/ApiKeyCreatedDialog
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * @description Props for the ApiKeyCreatedDialog component
 */
interface ApiKeyCreatedDialogProps {
  open: boolean
  onClose: () => void
  plaintextKey: string
}

/**
 * @description Dialog displaying the one-time plaintext API key after creation.
 *   Includes a copy-to-clipboard button, a warning that the key won't be shown again,
 *   and a collapsible section with example curl and promptfoo config.
 * @param {ApiKeyCreatedDialogProps} props - Dialog state and the plaintext key
 * @returns {JSX.Element} Rendered dialog
 */
export default function ApiKeyCreatedDialog({ open, onClose, plaintextKey }: ApiKeyCreatedDialogProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [showExamples, setShowExamples] = useState(false)

  /**
   * @description Copy the plaintext key to clipboard with visual feedback
   */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(plaintextKey)
    setCopied(true)
    // Reset copied state after 2 seconds
    setTimeout(() => setCopied(false), 2000)
  }

  const curlExample = `curl -X POST http://localhost:3001/api/v1/external/chat \\
  -H "Authorization: Bearer ${plaintextKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "Your question here", "dataset_ids": ["<dataset-uuid>"]}'`

  const promptfooExample = `providers:
  - id: http
    config:
      url: "http://localhost:3001/api/v1/external/chat"
      method: POST
      headers:
        Authorization: "Bearer ${plaintextKey}"
        Content-Type: "application/json"
      body:
        query: "{{query}}"
        dataset_ids: ["<dataset-uuid>"]
      transformResponse: "json"

defaultTest:
  options:
    transform: "output.answer"
  assert:
    - type: context-faithfulness
      threshold: 0.8
      value: "output.contexts.map(c => c.text).join('\\\\n\\\\n')"
    - type: context-relevance
      threshold: 0.7
      value: "output.contexts.map(c => c.text).join('\\\\n\\\\n')"
    - type: answer-relevance
      threshold: 0.8`

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('apiKeys.keyCreated')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning banner */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {t('apiKeys.keyCreatedWarning')}
            </p>
          </div>

          {/* Key display with copy button */}
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-muted p-3 rounded-md font-mono break-all select-all">
              {plaintextKey}
            </code>
            <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
              {copied
                ? <><Check className="h-4 w-4 mr-1" /> {t('apiKeys.copied')}</>
                : <><Copy className="h-4 w-4 mr-1" /> {t('apiKeys.copyKey')}</>
              }
            </Button>
          </div>

          {/* Collapsible example usage */}
          <div>
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showExamples ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {t('apiKeys.exampleUsage')}
            </button>

            {showExamples && (
              <div className="mt-3 space-y-3">
                {/* curl example */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">curl</p>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                    {curlExample}
                  </pre>
                </div>

                {/* promptfoo config example */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">promptfooconfig.yaml</p>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                    {promptfooExample}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t('dialog.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
