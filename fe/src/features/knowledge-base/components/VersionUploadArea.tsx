/**
 * @fileoverview Upload area for version documents.
 *
 * Provides drag-and-drop, file picker, and folder upload support.
 * Shows per-file upload progress with file name, size, and status.
 * Uploads files sequentially via the existing uploadVersionDocument API.
 *
 * @module features/knowledge-base/components/VersionUploadArea
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { UploadCloud, FolderUp, CheckCircle, XCircle, Loader } from 'lucide-react'
import { globalMessage } from '@/app/App'
import { uploadVersionDocument } from '../api/knowledgeBaseApi'

// ============================================================================
// Constants
// ============================================================================

/** Accepted file extensions for document upload */
const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv'

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

interface VersionUploadAreaProps {
  /** Knowledge Base ID */
  knowledgeBaseId: string
  /** Category ID */
  categoryId: string
  /** Version ID to upload documents to */
  versionId: string
  /** Callback after uploads complete to refresh document list */
  onUploadComplete?: () => void
}

/** Per-file upload tracking */
interface FileUploadItem {
  /** Unique key for the file */
  key: string
  /** File name */
  name: string
  /** File size in bytes */
  size: number
  /** Upload status */
  status: 'pending' | 'uploading' | 'success' | 'failed'
  /** Error message (if failed) */
  error?: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format bytes into a human-readable size string.
 * @param bytes - File size in bytes
 * @returns Formatted size string (e.g. "1.5 MB")
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
 * Upload area with drag-and-drop, file picker, and folder upload.
 * Shows per-file upload progress with individual status indicators.
 *
 * @param {VersionUploadAreaProps} props - Component props
 * @returns {JSX.Element} The rendered upload area
 */
const VersionUploadArea = ({ knowledgeBaseId, categoryId, versionId, onUploadComplete }: VersionUploadAreaProps) => {
  const { t } = useTranslation()

  // ── State ──────────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false)
  const [fileList, setFileList] = useState<FileUploadItem[]>([])
  const [dragActive, setDragActive] = useState(false)
  /** Hidden file input ref for file selection */
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** Hidden folder input ref for directory selection */
  const folderInputRef = useRef<HTMLInputElement>(null)

  // ── Handlers ───────────────────────────────────────────────────────────

  /**
   * Upload a list of files sequentially with per-file tracking.
   * @param files - Array of File objects to upload
   */
  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)

    // Build file items for tracking
    const items: FileUploadItem[] = files.map((f, i) => ({
      key: `${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      status: 'pending' as const,
    }))
    setFileList(items)

    let succeeded = 0
    let failed = 0

    // Upload files one at a time to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const item = items[i]!
      // Mark current file as uploading
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

    // Show result summary
    if (failed === 0) {
      globalMessage.success(t('knowledgeBase.documents.uploadSuccess'))
    } else {
      globalMessage.warning(
        `${succeeded}/${files.length} ${t('knowledgeBase.documents.uploadSuccess')}. ${failed} ${t('knowledgeBase.documents.uploadError')}`
      )
    }

    setUploading(false)
    onUploadComplete?.()
    // Clear file list after a short delay so user sees final states
    setTimeout(() => setFileList([]), 3000)
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

  /**
   * Handle folder input change event — collects all files recursively.
   * @param e - Change event from the hidden folder input
   */
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files
    if (!inputFiles || inputFiles.length === 0) return

    // Filter files by accepted extensions
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
    // Reset file input so the same folder can be selected again
    e.target.value = ''
  }

  /** Count of completed uploads */
  const completedCount = fileList.filter((f) => f.status === 'success' || f.status === 'failed').length
  /** Overall progress percentage */
  const overallPercent = fileList.length > 0 ? Math.round((completedCount / fileList.length) * 100) : 0
  /** Count of failures */
  const failedCount = fileList.filter((f) => f.status === 'failed').length

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="mt-4 space-y-3">
      {/* Compact drag-and-drop + folder button row */}
      <div className="flex gap-3 items-stretch">
        {/* Drag-and-drop area */}
        <div
          className={cn(
            'flex-1 border-2 border-dashed rounded-lg p-3 cursor-pointer transition-colors',
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
          <div className="flex items-center gap-3">
            <UploadCloud size={24} className="text-gray-400 shrink-0" />
            <div className="text-left">
              <p className="text-sm text-gray-600 dark:text-gray-400 m-0">
                {t('knowledgeBase.documents.uploadHint')}
              </p>
              <p className="text-xs text-gray-400 m-0">
                {t('knowledgeBase.documents.acceptedTypes')}
              </p>
            </div>
          </div>
        </div>

        {/* Folder upload button */}
        <Button
          variant="outline"
          disabled={uploading}
          onClick={() => folderInputRef.current?.click()}
          className="h-auto flex flex-col items-center justify-center px-4 gap-1"
        >
          <FolderUp size={16} />
          <span className="text-xs">{t('knowledgeBase.documents.folderUpload')}</span>
        </Button>
      </div>

      {/* Per-file upload progress list */}
      {fileList.length > 0 && (
        <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
          {/* Overall progress header */}
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
                  {/* File name */}
                  <span className="text-xs truncate text-gray-700 dark:text-gray-300">{item.name}</span>
                </div>
                {/* File size + status tag */}
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

      {/* Hidden folder input (supports directory attribute) */}
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
    </div>
  )
}

export default VersionUploadArea
