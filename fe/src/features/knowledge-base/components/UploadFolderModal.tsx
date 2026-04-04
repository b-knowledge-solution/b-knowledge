/**
 * @fileoverview Modal dialog for uploading an entire folder.
 *
 * Uses a hidden webkitdirectory input to pick a folder, then uploads
 * all supported files sequentially with per-file progress tracking.
 *
 * @module features/knowledge-base/components/UploadFolderModal
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { FolderUp, CheckCircle, XCircle, Loader } from 'lucide-react'
import { globalMessage } from '@/lib/globalMessage'
import { uploadVersionDocument } from '../api/knowledgeBaseApi'

// ============================================================================
// Constants
// ============================================================================

/** Accepted file extensions for filtering folder contents */
const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv'

// ============================================================================
// Types
// ============================================================================

interface UploadFolderModalProps {
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
  status: 'pending' | 'uploading' | 'success' | 'failed'
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
 * Modal with folder picker and per-file upload progress tracking.
 *
 * @param {UploadFolderModalProps} props - Component props
 * @returns {JSX.Element} The rendered modal
 */
const UploadFolderModal = ({
  open,
  knowledgeBaseId,
  categoryId,
  versionId,
  onClose,
  onUploadComplete,
}: UploadFolderModalProps) => {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [fileList, setFileList] = useState<FileUploadItem[]>([])
  const folderInputRef = useRef<HTMLInputElement>(null)

  /**
   * Upload files sequentially with per-file tracking.
   * @param files - Array of File objects to upload
   */
  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)

    const items: FileUploadItem[] = files.map((f, i) => ({
      key: `${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      status: 'pending' as const,
    }))
    setFileList(items)

    let succeeded = 0
    let failed = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const item = items[i]!
      item.status = 'uploading'
      setFileList([...items])

      try {
        await uploadVersionDocument(knowledgeBaseId, categoryId, versionId, file)
        item.status = 'success'
        succeeded++
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err)
        item.status = 'failed'
        item.error = String(err)
        failed++
      }
      setFileList([...items])
    }

    if (failed === 0) {
      globalMessage.success(t('knowledgeBase.documents.uploadSuccess'))
    } else {
      globalMessage.warning(
        `${succeeded}/${files.length} ${t('knowledgeBase.documents.uploadSuccess')}. ${failed} ${t('knowledgeBase.documents.uploadError')}`
      )
    }

    setUploading(false)
    onUploadComplete?.()
    setTimeout(() => setFileList([]), 3000)
  }

  /**
   * Handle folder input change — filter and upload supported files.
   * @param e - Change event from the hidden folder input
   */
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files
    if (!inputFiles || inputFiles.length === 0) return

    const acceptedExts = ACCEPTED_EXTENSIONS.split(',')
    const files = Array.from(inputFiles).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      return acceptedExts.includes(ext)
    })

    if (files.length === 0) {
      globalMessage.warning(t('knowledgeBase.documents.acceptedTypes'))
      return
    }

    handleUploadFiles(files)
    e.target.value = ''
  }

  /** Handle modal close — only allow if not uploading */
  const handleClose = () => {
    if (uploading) return
    setFileList([])
    onClose()
  }

  // Progress stats
  const completedCount = fileList.filter((f) => f.status === 'success' || f.status === 'failed').length
  const overallPercent = fileList.length > 0 ? Math.round((completedCount / fileList.length) * 100) : 0
  const failedCount = fileList.filter((f) => f.status === 'failed').length

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('knowledgeBase.documents.uploadFolderTitle')}</DialogTitle>
        </DialogHeader>

        {/* Folder select area */}
        <div className="flex flex-col items-center gap-3 py-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
          <FolderUp size={36} className="text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400 m-0">
            {t('knowledgeBase.documents.folderUploadHint')}
          </p>
          <p className="text-xs text-gray-400 m-0">
            {t('knowledgeBase.documents.acceptedTypes')}
          </p>
          <Button
            disabled={uploading}
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderUp size={14} className="mr-1" />
            {t('knowledgeBase.documents.selectFolder')}
          </Button>
        </div>

        {/* Per-file upload progress */}
        {fileList.length > 0 && (
          <div className="mt-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {t('knowledgeBase.documents.uploading')} {completedCount}/{fileList.length}
              </span>
              <Progress
                value={overallPercent}
                className={cn(
                  'w-[120px] h-2',
                  failedCount > 0 && '[&>div]:bg-destructive'
                )}
              />
            </div>

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
                    {item.status === 'uploading' && <Badge variant="info" className="text-xs">{t('knowledgeBase.documents.uploading')}</Badge>}
                    {item.status === 'failed' && <Badge variant="destructive" className="text-xs">{t('knowledgeBase.documents.uploadError')}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Hidden folder input */}
        <input
          ref={folderInputRef}
          type="file"
          // @ts-ignore — webkitdirectory is a non-standard attribute
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleFolderSelect}
        />
      </DialogContent>
    </Dialog>
  )
}

export default UploadFolderModal
