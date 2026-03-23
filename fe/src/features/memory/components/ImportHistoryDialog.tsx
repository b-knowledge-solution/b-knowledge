/**
 * @fileoverview Dialog for importing existing chat history into a memory pool.
 * Lists available chat conversations and triggers memory extraction.
 *
 * @module features/memory/components/ImportHistoryDialog
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, CheckCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { memoryApi } from '../api/memoryApi'
import { useImportChatHistory } from '../api/memoryQueries'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the ImportHistoryDialog component
 */
interface ImportHistoryDialogProps {
  /** Memory pool UUID to import into */
  memoryId: string
  /** Whether the dialog is open */
  open: boolean
  /** Callback to toggle dialog open state */
  onOpenChange: (open: boolean) => void
}

/** @description Import progress states */
type ImportState = 'idle' | 'importing' | 'complete'

/**
 * @description Chat session item from the conversations endpoint
 */
interface ChatSession {
  id: string
  name: string
  created_at: string
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Dialog component for importing chat history into a memory pool.
 * Loads available chat conversations, allows selection, and triggers import.
 * Shows progress and completion count.
 * @param {ImportHistoryDialogProps} props - Memory pool ID and dialog state
 * @returns {JSX.Element} Rendered import dialog
 */
export function ImportHistoryDialog({ memoryId, open, onOpenChange }: ImportHistoryDialogProps) {
  const { t } = useTranslation()

  const importMutation = useImportChatHistory()

  // Dialog-local state
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [manualSessionId, setManualSessionId] = useState('')
  const [importState, setImportState] = useState<ImportState>('idle')
  const [importedCount, setImportedCount] = useState(0)
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Load chat sessions when dialog opens
  useEffect(() => {
    if (!open) return
    // Reset state when dialog opens
    setImportState('idle')
    setImportedCount(0)
    setSelectedSessionId('')
    setManualSessionId('')

    // Fetch available conversations
    setSessionsLoading(true)
    memoryApi.getChatSessions()
      .then((data) => setSessions(data))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false))
  }, [open])

  // Determine the effective session ID (dropdown selection or manual input)
  const effectiveSessionId = selectedSessionId || manualSessionId.trim()

  /**
   * @description Trigger chat history import for the selected session
   */
  const handleImport = async () => {
    if (!effectiveSessionId) return
    setImportState('importing')
    try {
      const result = await importMutation.mutateAsync({
        memoryId,
        sessionId: effectiveSessionId,
      })
      setImportedCount(result.imported)
      setImportState('complete')
    } catch {
      // Reset to idle on error so user can retry
      setImportState('idle')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark:bg-slate-900 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('memory.importHistory')}</DialogTitle>
          <DialogDescription>
            {t('memory.importDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {importState === 'complete' ? (
            /* Completion state */
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle size={40} className="text-green-500 mb-3" />
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {t('memory.importComplete', { count: importedCount })}
              </p>
            </div>
          ) : (
            <>
              {/* Session selector dropdown */}
              <div className="space-y-2">
                <Label>{t('memory.selectSession')}</Label>
                {sessionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={14} className="animate-spin" />
                    {t('common.loading', { defaultValue: 'Loading...' })}
                  </div>
                ) : sessions.length > 0 ? (
                  <Select
                    value={selectedSessionId}
                    onValueChange={(val: string) => {
                      setSelectedSessionId(val)
                      // Clear manual input when dropdown is used
                      setManualSessionId('')
                    }}
                  >
                    <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700">
                      <SelectValue placeholder={t('memory.selectSession')} />
                    </SelectTrigger>
                    <SelectContent>
                      {sessions.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.name || session.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              {/* Manual session ID input as fallback */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">
                  {t('common.or', { defaultValue: 'Or enter session ID manually' })}
                </Label>
                <Input
                  value={manualSessionId}
                  onChange={(e) => {
                    setManualSessionId(e.target.value)
                    // Clear dropdown when typing manually
                    setSelectedSessionId('')
                  }}
                  placeholder="Session ID"
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {importState === 'complete' ? (
            <Button onClick={() => onOpenChange(false)}>
              {t('common.close', { defaultValue: 'Close' })}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleImport}
                disabled={!effectiveSessionId || importState === 'importing'}
              >
                {importState === 'importing' ? (
                  <>
                    <Loader2 size={14} className="mr-1 animate-spin" />
                    {t('memory.importing')}
                  </>
                ) : (
                  <>
                    <Upload size={14} className="mr-1" />
                    {t('memory.importHistory')}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
