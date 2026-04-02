/**
 * @fileoverview Modal dialog for uploading files via drag-and-drop.
 *
 * Shows a styled drop zone inside a dialog with per-file progress tracking.
 *
 * @module features/knowledge-base/components/UploadFilesModal
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { UploadCloud, CheckCircle, XCircle, Loader } from 'lucide-react'
import { globalMessage } from '@/app/App'
import { UploadStatus } from '@/constants'
import { uploadVersionDocument } from '../api/knowledgeBaseApi'

// ============================================================================
// Constants
// ============================================================================

/** Accepted MIME types for the file input */
const ACCEPTED_MIME =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,' +
  'application/pdf,' +
  'application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-powerpoint,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'text/plain,' +
  'text/markdown,' +
  'text/csv'

// ============================================================================
// Types
// ============================================================================

interface UploadFilesModalProps {
  /** Whether the modal is visible */
  open: boolean
  /** Knowledge Base ID */
  knowledgeBaseId: string
  /** Category ID */
  categoryId: string
  /** Version ID to upload documents to */
  versionId: string
  /** Callback when modal is closed */
  onClose: () => void
  /** Callback after uploads complete to refresh document list */
  onUploadComplete?: () => void
}

/** Per-file upload tracking */
interface FileUploadItem {
  key: string
  name: string
  size: number
  status: typeof UploadStatus[keyof typeof UploadStatus]
  error?: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format bytes into a human-readable size string.
 * @param bytes - File size in bytes
 * @returns Formatted size string
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal with drag-and-drop file upload and per-file progress tracking.
 *
 * @param {UploadFilesModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const UploadFilesModal = ({
  open,
  knowledgeBaseId,
  categoryId,
  versionId,
  onClose,
  onUploadComplete,
}: UploadFilesModalProps) => {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [fileList, setFileList] = useState<FileUploadItem[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Upload files sequentially with per-file tracking.
   * @param files - Array of File objects to upload
   */
  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)

    // Build tracking items
    const items: FileUploadItem[] = files.map((f, i) => ({
      key: `${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      status: UploadStatus.PENDING as const,
    }))
    setFileList(items)

    let succeeded = 0
    let failed = 0

    // Upload one at a time
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const item = items[i]!
      item.status = UploadStatus.UPLOADING
      setFileList([...items])

      try {
        await uploadVersionDocument(knowledgeBaseId, categoryId, versionId, file)
        item.status = UploadStatus.SUCCESS
        succeeded++
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err)
        item.status = UploadStatus.FAILED
        item.error = String(err)
        failed++
      }
      setFileList([...items])
    }

    // Show summary
    if (failed === 0) {
      globalMessage.success(t('projectManagement.documents.uploadSuccess'))
    } else {
      globalMessage.warning(
        `${succeeded}/${files.length} ${t('projectManagement.documents.uploadSuccess')}. ${failed} ${t('projectManagement.documents.uploadError')}`
      )
    }

    setUploading(false)
    onUploadComplete?.()
    // Clear progress after a short delay
    setTimeout(() => setFileList([]), 3000)
  }

  /** Handle modal close — only allow if not uploading */
  const handleClose = () => {
    if (uploading) return
    setFileList([])
    onClose()
  }

  /** Handle files dropped onto the drop zone */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    // Ignore drops while uploading
    if (uploading) return
    const files = Array.from(e.dataTransfer.files)
    handleUploadFiles(files)
  }

  /** Handle file input change */
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    handleUploadFiles(Array.from(files))
    // Reset input so the same files can be selected again
    e.target.value = ''
  }

  // Progress stats
  const completedCount = fileList.filter((f) => f.status === UploadStatus.SUCCESS || f.status === UploadStatus.FAILED).length
  const overallPercent = fileList.length > 0 ? Math.round((completedCount / fileList.length) * 100) : 0
  const failedCount = fileList.filter((f) => f.status === 'failed').length

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('projectManagement.documents.uploadFiles')}</DialogTitle>
        </DialogHeader>

        {/* Drag-and-drop area */}
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            uploading && 'pointer-events-none opacity-60',
            dragActive ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-gray-600 hover:border-primary'
          )}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={ACCEPTED_MIME}
            onChange={handleFileInputChange}
          />
          <div className="flex flex-col items-center gap-2">
            <UploadCloud size={36} className="text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-400 m-0">
              {t('projectManagement.documents.uploadHint')}
            </p>
            <p className="text-xs text-gray-400 m-0">
              {t('projectManagement.documents.acceptedTypes')}
            </p>
          </div>
        </div>

        {/* Per-file upload progress */}
        {fileList.length > 0 && (
          <div className="mt-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            {/* Overall progress */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {t('projectManagement.documents.uploading')} {completedCount}/{fileList.length}
              </span>
              <Progress
                value={overallPercent}
                className={cn(
                  'w-[120px] h-2',
                  failedCount > 0 && '[&>div]:bg-destructive'
                )}
              />
            </div>

            {/* Individual file list */}
            <ul className="max-h-[200px] overflow-auto space-y-1">
              {fileList.map((item) => (
                <li key={item.key} className="flex items-center justify-between w-full gap-2 py-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Status icon */}
                    {item.status === 'success' && <CheckCircle size={14} className="text-green-500 shrink-0" />}
                    {item.status === 'failed' && <XCircle size={14} className="text-red-500 shrink-0" />}
                    {item.status === 'uploading' && <Loader size={14} className="text-blue-500 animate-spin shrink-0" />}
                    {item.status === 'pending' && <div className="w-[14px] h-[14px] rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />}
                    <span className="text-xs truncate text-gray-700 dark:text-gray-300">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{formatFileSize(item.size)}</span>
                    {item.status === 'uploading' && <Badge variant="info" className="text-xs">{t('projectManagement.documents.uploading')}</Badge>}
                    {item.status === 'failed' && <Badge variant="destructive" className="text-xs">{t('projectManagement.documents.uploadError')}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default UploadFilesModal
