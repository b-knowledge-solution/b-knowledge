/**
 * @fileoverview Dialog for managing search app embed tokens, iframe code generation,
 * and embed customization options.
 * @module features/search/components/SearchAppEmbedDialog
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Code2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import EmbedTokenManager from '@/components/EmbedTokenManager'
import type { SearchApp } from '../types/search.types'

// ============================================================================
// Props
// ============================================================================

/**
 * @description Props for the SearchAppEmbedDialog component.
 */
interface SearchAppEmbedDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Search app to manage embed tokens for */
  app: SearchApp | null
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Dialog for managing embed tokens, generating iframe embed code,
 * and configuring embed display options (avatar visibility, footer, locale).
 * @param {SearchAppEmbedDialogProps} props - Component properties
 * @returns {JSX.Element} Rendered embed dialog with token manager, options, and iframe code
 */
export default function SearchAppEmbedDialog({
  open,
  onClose,
  app,
}: SearchAppEmbedDialogProps) {
  const { t } = useTranslation()

  // Embed option state
  const [showAvatar, setShowAvatar] = useState(true)
  const [showPoweredBy, setShowPoweredBy] = useState(false)
  const [locale, setLocale] = useState('en')

  // Copy-to-clipboard feedback state
  const [copied, setCopied] = useState(false)

  // Track the most recently created token for iframe URL
  const [selectedToken, setSelectedToken] = useState<string | null>(null)

  // Build query params from option state
  const queryParts: string[] = []
  // Append hide_avatar when the user unchecks the avatar toggle
  if (!showAvatar) queryParts.push('hide_avatar=true')
  // Append hide_powered_by when the user unchecks the footer toggle
  if (!showPoweredBy) queryParts.push('hide_powered_by=true')
  // Always include locale selection
  queryParts.push(`locale=${locale}`)
  const queryParams = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''

  // Build the full iframe HTML string
  const tokenPlaceholder = selectedToken || 'YOUR_TOKEN'
  const iframeCode = `<iframe
  src="${window.location.origin}/search/share/${tokenPlaceholder}${queryParams}"
  width="100%"
  height="600"
  frameborder="0"
  allow="clipboard-write"
></iframe>`

  /**
   * Copy the iframe code to the clipboard with a 2-second checkmark feedback.
   */
  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(iframeCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may not be available in insecure contexts
    }
  }

  return (
    <Dialog open={open && !!app} onOpenChange={(nextOpen: boolean) => { if (!nextOpen) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('searchAdmin.embedApp')}</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">{app?.name}</span>
            {app?.id && (
              <code className="block rounded bg-muted px-2 py-1 text-xs text-muted-foreground break-all">
                /search/apps/{app.id}
              </code>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Embed token management section */}
        {app && (
          <EmbedTokenManager
            entityId={app.id}
            entityType="search_app"
            onTokensChange={() => {
              // No-op: tokens are managed internally by EmbedTokenManager
            }}
          />
        )}

        <Separator />

        {/* Embed options section */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            {t('searchAdmin.embedOptions')}
          </h4>

          {/* Token input for iframe URL */}
          <div className="space-y-1.5">
            <Label htmlFor="embed-token" className="text-xs">
              Token
            </Label>
            <input
              id="embed-token"
              type="text"
              value={selectedToken || ''}
              onChange={(e) => setSelectedToken(e.target.value || null)}
              placeholder="YOUR_TOKEN"
              className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Show avatar checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="embed-show-avatar"
              checked={showAvatar}
              onCheckedChange={(checked) => setShowAvatar(checked === true)}
            />
            <Label htmlFor="embed-show-avatar" className="text-sm cursor-pointer">
              {t('searchAdmin.showAvatar')}
            </Label>
          </div>

          {/* Show powered-by footer checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="embed-show-powered-by"
              checked={showPoweredBy}
              onCheckedChange={(checked) => setShowPoweredBy(checked === true)}
            />
            <Label htmlFor="embed-show-powered-by" className="text-sm cursor-pointer">
              {t('searchAdmin.showPoweredBy')}
            </Label>
          </div>

          {/* Default locale selector */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('searchAdmin.defaultLocale')}</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="vi">Tiếng Việt</SelectItem>
                <SelectItem value="ja">日本語</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Generated iframe code section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{t('searchAdmin.embedCode')}</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCode}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t('searchAdmin.copyCode')}
            </Button>
          </div>

          <pre className="rounded-md border bg-muted p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {iframeCode}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  )
}
