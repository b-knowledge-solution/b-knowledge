/**
 * @fileoverview Dialog for creating a new API key with name, scopes, and optional expiration.
 * @module features/api-keys/components/CreateApiKeyDialog
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { API_KEY_SCOPES } from '../types/apiKey.types'
import type { CreateApiKeyDto } from '../types/apiKey.types'

/**
 * @description Props for the CreateApiKeyDialog component
 */
interface CreateApiKeyDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CreateApiKeyDto) => void
  isPending: boolean
}

/**
 * @description Dialog form for creating a new API key.
 *   Collects name, scopes (checkboxes), and optional expiration date.
 * @param {CreateApiKeyDialogProps} props - Dialog state and handlers
 * @returns {JSX.Element} Rendered dialog
 */
export default function CreateApiKeyDialog({ open, onClose, onSubmit, isPending }: CreateApiKeyDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>([...API_KEY_SCOPES])
  const [expiresAt, setExpiresAt] = useState('')
  const [nameError, setNameError] = useState('')

  /**
   * @description Toggle a scope in the selected scopes array
   * @param {string} scope - The scope to toggle
   */
  const toggleScope = (scope: string) => {
    setScopes(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
    )
  }

  /**
   * @description Reset form state when dialog closes
   */
  const handleClose = () => {
    setName('')
    setScopes([...API_KEY_SCOPES])
    setExpiresAt('')
    setNameError('')
    onClose()
  }

  /**
   * @description Validate and submit the form
   */
  const handleSubmit = () => {
    // Validate name
    if (!name.trim()) {
      setNameError(t('apiKeys.name') + ' is required')
      return
    }

    // Require at least one scope
    if (scopes.length === 0) return

    onSubmit({
      name: name.trim(),
      scopes,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{t('apiKeys.createKey')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name field */}
          <div>
            <Label htmlFor="api-key-name">{t('apiKeys.name')} *</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                // Clear error on change
                if (nameError) setNameError('')
              }}
              placeholder={t('apiKeys.namePlaceholder')}
              className="mt-1"
            />
            {nameError && (
              <p className="mt-1 text-xs text-destructive">{nameError}</p>
            )}
          </div>

          {/* Scopes checkboxes */}
          <div>
            <Label>{t('apiKeys.scopes')} *</Label>
            <div className="flex gap-4 mt-2">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={scopes.includes(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                  />
                  <span className="text-sm">
                    {t(`apiKeys.scope${scope.charAt(0).toUpperCase()}${scope.slice(1)}`)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Optional expiration */}
          <div>
            <Label htmlFor="api-key-expires">{t('apiKeys.expiresAt')}</Label>
            <Input
              id="api-key-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || scopes.length === 0}>
            {isPending ? t('common.loading') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
