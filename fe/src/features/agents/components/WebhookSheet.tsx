/**
 * @fileoverview Webhook configuration sheet for agents.
 * Displays the webhook URL, copy button, and example curl command.
 *
 * @module features/agents/components/WebhookSheet
 */

import { useTranslation } from 'react-i18next'
import { Webhook, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the WebhookSheet component
 */
interface WebhookSheetProps {
  /** Whether the sheet is open */
  open: boolean
  /** Callback to close the sheet */
  onClose: () => void
  /** Agent UUID for constructing the webhook URL */
  agentId: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Side sheet displaying the webhook configuration for an agent.
 *   Shows the webhook URL with a copy button, usage instructions, and an
 *   example curl command for external integration.
 * @param {WebhookSheetProps} props - Sheet configuration
 * @returns {JSX.Element} Rendered webhook configuration sheet
 */
export function WebhookSheet({ open, onClose, agentId }: WebhookSheetProps) {
  const { t } = useTranslation()

  // Build the full webhook URL using the current origin as base
  const apiBaseUrl = window.location.origin
  const webhookUrl = `${apiBaseUrl}/api/agents/webhook/${agentId}`

  /**
   * Copy the webhook URL to the clipboard and show a success toast
   */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      toast.success(t('agents.urlCopied', 'URL copied'))
    } catch {
      // Fallback for environments where clipboard API is unavailable
      toast.error(t('common.copyFailed', 'Failed to copy'))
    }
  }

  // Example curl command for documentation purposes
  const curlExample = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "Hello, agent!"}'`

  /**
   * Copy the curl example to clipboard
   */
  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlExample)
      toast.success(t('agents.curlCopied', 'Curl command copied'))
    } catch {
      toast.error(t('common.copyFailed', 'Failed to copy'))
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose() }}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            {t('agents.webhook', 'Webhook')}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-2">
          <div className="space-y-6">
            {/* Webhook URL section */}
            <div className="space-y-2">
              <Label>{t('agents.webhookUrl', 'Webhook URL')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  title={t('common.copy', 'Copy')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  'agents.webhookDescription',
                  'POST requests to this URL will trigger the agent.',
                )}
              </p>
            </div>

            {/* Request format section */}
            <div className="space-y-2">
              <Label>{t('agents.requestFormat', 'Request Format')}</Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'agents.webhookPayloadHelp',
                  'Send a JSON body with an "input", "message", or "query" field containing the text to process.',
                )}
              </p>
            </div>

            {/* Example curl command */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('agents.exampleCurl', 'Example')}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyCurl}
                  className="h-7 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {t('common.copy', 'Copy')}
                </Button>
              </div>
              <pre className="rounded-md border border-border bg-muted/50 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap break-all overflow-auto">
                {curlExample}
              </pre>
            </div>

            {/* Response format documentation */}
            <div className="space-y-2">
              <Label>{t('agents.responseFormat', 'Response')}</Label>
              <pre className="rounded-md border border-border bg-muted/50 dark:bg-slate-900/50 p-3 text-xs font-mono whitespace-pre-wrap">
{`{
  "run_id": "<uuid>"
}`}
              </pre>
              <p className="text-xs text-muted-foreground">
                {t(
                  'agents.webhookResponseHelp',
                  'The response contains the run ID. Use the agent runs API to check execution status.',
                )}
              </p>
            </div>

            {/* Rate limit info */}
            <div className="rounded-md border border-border bg-muted/30 dark:bg-muted/10 p-3">
              <div className="flex items-start gap-2">
                <ExternalLink className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium">
                    {t('agents.rateLimitInfo', 'Rate Limit')}
                  </p>
                  <p>
                    {t(
                      'agents.rateLimitDescription',
                      '100 requests per 15 minutes per IP address.',
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
