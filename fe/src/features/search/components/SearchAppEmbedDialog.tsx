/**
 * @fileoverview Dialog for managing search app embed tokens and widget setup.
 * @module features/search/components/SearchAppEmbedDialog
 */

import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import EmbedTokenManager from '@/components/EmbedTokenManager'
import type { SearchApp } from '../types/search.types'

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

/**
 * @description Dialog for managing embed tokens for a search app and showing
 * the route used for the in-app search experience.
 * @param {SearchAppEmbedDialogProps} props - Component properties
 * @returns {JSX.Element} Rendered embed dialog
 */
export default function SearchAppEmbedDialog({
  open,
  onClose,
  app,
}: SearchAppEmbedDialogProps) {
  const { t } = useTranslation()

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

        {app && (
          <EmbedTokenManager
            entityId={app.id}
            entityType="search_app"
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
