/**
 * @fileoverview Dialog for changing a document's parser/chunking method.
 * Shows the current parser, a dropdown to select a new one, and a destructive
 * warning that existing chunks will be deleted.
 *
 * @module features/datasets/components/ChangeParserDialog
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PARSER_OPTIONS } from '../types'
import type { Document } from '../types'

/**
 * @description Props for the ChangeParserDialog component.
 */
interface ChangeParserDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** The document whose parser is being changed */
  document: Document | null
  /** Whether the mutation is in progress */
  submitting: boolean
  /** Callback to confirm the parser change */
  onConfirm: (docId: string, parserId: string) => void
}

/**
 * @description Dialog for changing a document's parser method with destructive warning.
 * Displays current parser, new parser selector, and alert about chunk deletion.
 * @param {ChangeParserDialogProps} props - Dialog configuration
 * @returns {JSX.Element} Rendered change parser dialog
 */
export default function ChangeParserDialog({
  open,
  onClose,
  document,
  submitting,
  onConfirm,
}: ChangeParserDialogProps) {
  const { t } = useTranslation()
  const [selectedParser, setSelectedParser] = useState<string>('')

  // Reset selected parser when dialog opens with a new document
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && document) {
      setSelectedParser(document.parser_id || 'naive')
    }
    if (!isOpen) {
      onClose()
    }
  }

  /** Confirm parser change and close dialog */
  const handleConfirm = () => {
    if (!document || !selectedParser) return
    onConfirm(document.id, selectedParser)
  }

  // Determine if the confirm button should be disabled
  const isUnchanged = selectedParser === (document?.parser_id || 'naive')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('datasets.changeParser')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current parser display */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('datasets.currentParser')}:</span>
            <Badge variant="outline" className="capitalize">
              {document?.parser_id === 'naive' ? 'General' : document?.parser_id || 'General'}
            </Badge>
          </div>

          {/* New parser selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('datasets.newParser')}</label>
            <Select value={selectedParser} onValueChange={setSelectedParser}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARSER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destructive warning alert */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {t('datasets.changeParserWarning')}
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting || isUnchanged}
          >
            {t('datasets.changeParser')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
