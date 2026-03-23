/**
 * @fileoverview Dialog for changing a document's parser/chunking method.
 * Shows the current parser, a dropdown to select a new one, parser-specific
 * ingestion settings, and a destructive warning that existing chunks will be deleted.
 *
 * @module features/datasets/components/ChangeParserDialog
 */

import { useState, useEffect } from 'react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
import { PARSER_OPTIONS } from '../types'
import type { Document } from '../types'
import ParserSettingsFields from './ParserSettingsFields'

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
  /** Callback to confirm the parser change with optional parser_config */
  onConfirm: (docId: string, parserId: string, parserConfig?: Record<string, unknown>) => void
}

/** Default parser_config values for a fresh configuration */
const DEFAULT_PARSER_CONFIG: Record<string, unknown> = {
  chunk_token_num: 512,
  delimiter: '\\n',
  layout_recognize: 'DeepDOC',
  overlapped_percent: 0,
  auto_keywords: 0,
  auto_questions: 0,
  toc_extraction: false,
  child_chunk: false,
  child_chunk_delimiter: '\\n',
  image_table_context: 0,
}

/**
 * @description Dialog for changing a document's parser method with destructive warning
 * and parser-specific ingestion settings. Displays current parser, new parser selector,
 * configuration fields, and alert about chunk deletion.
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
  const [parserConfig, setParserConfig] = useState<Record<string, unknown>>({ ...DEFAULT_PARSER_CONFIG })

  // Reset selected parser and config when dialog opens with a new document
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && document) {
      setSelectedParser(document.parser_id || 'naive')
      // Attempt to use document-level parser_config if available, else defaults
      setParserConfig({ ...DEFAULT_PARSER_CONFIG })
    }
    if (!isOpen) {
      onClose()
    }
  }

  // Reset parser_config to defaults when parser type changes
  useEffect(() => {
    if (selectedParser) {
      setParserConfig({ ...DEFAULT_PARSER_CONFIG })
    }
  }, [selectedParser])

  /** Update a single parser_config key */
  const handleConfigChange = (key: string, value: unknown) => {
    setParserConfig((prev) => ({ ...prev, [key]: value }))
  }

  /** Confirm parser change and close dialog */
  const handleConfirm = () => {
    if (!document || !selectedParser) return
    onConfirm(document.id, selectedParser, parserConfig)
  }

  // Determine if the confirm button should be disabled
  const isUnchanged = selectedParser === (document?.parser_id || 'naive')

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('datasets.changeParser')}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto pr-4">
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

            {/* Parser-specific ingestion settings */}
            {selectedParser && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">
                  {t('datasets.parserSettings', 'Parser Settings')}
                </h4>
                <div className="rounded-md border border-border p-4 bg-muted/20 dark:bg-slate-900/30">
                  <ParserSettingsFields
                    parserId={selectedParser}
                    parserConfig={parserConfig}
                    onConfigChange={handleConfigChange}
                  />
                </div>
              </div>
            )}

            {/* Destructive warning alert */}
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t('datasets.changeParserWarning')}
              </AlertDescription>
            </Alert>
          </div>
        </ScrollArea>

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
