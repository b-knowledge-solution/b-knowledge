/**
 * @fileoverview Dialog for creating a document by crawling a web URL.
 * Provides URL input, optional name override, auto-parse toggle, and
 * basic URL validation before submission.
 *
 * @module features/datasets/components/WebCrawlDialog
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

/**
 * @description Props for the WebCrawlDialog component.
 */
interface WebCrawlDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Whether the mutation is in progress */
  submitting: boolean
  /** Callback to submit the crawl request */
  onSubmit: (data: { url: string; name?: string; auto_parse?: boolean }) => void
}

/**
 * @description Dialog for creating a document from a web URL with optional name and auto-parse toggle.
 * @param {WebCrawlDialogProps} props - Dialog configuration
 * @returns {JSX.Element} Rendered web crawl dialog
 */
export default function WebCrawlDialog({
  open,
  onClose,
  submitting,
  onSubmit,
}: WebCrawlDialogProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [autoParse, setAutoParse] = useState(true)
  const [error, setError] = useState('')

  /** Reset form state when dialog opens */
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setUrl('')
      setName('')
      setAutoParse(true)
      setError('')
    }
    if (!isOpen) {
      onClose()
    }
  }

  /** Validate URL and submit crawl request */
  const handleSubmit = () => {
    setError('')
    // Validate URL format — must be HTTP or HTTPS
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setError(t('datasets.webCrawlInvalidUrl'))
        return
      }
    } catch {
      setError(t('datasets.webCrawlInvalidUrl'))
      return
    }
    onSubmit({
      url,
      ...(name.trim() ? { name: name.trim() } : {}),
      auto_parse: autoParse,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('datasets.webCrawl')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* URL input */}
          <div className="space-y-2">
            <Label>{t('datasets.webCrawlUrl')}</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page"
              type="url"
            />
          </div>

          {/* Optional document name */}
          <div className="space-y-2">
            <Label>{t('datasets.webCrawlName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('datasets.webCrawlNamePlaceholder')}
            />
          </div>

          {/* Auto-parse toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-parse-switch">{t('datasets.webCrawlAutoParse')}</Label>
            <Switch
              id="auto-parse-switch"
              checked={autoParse}
              onCheckedChange={setAutoParse}
            />
          </div>

          {/* Error display */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !url.trim()}>
            {t('datasets.webCrawlSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
