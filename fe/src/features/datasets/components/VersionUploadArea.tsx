/**
 * @fileoverview Drag-and-drop file upload area for version documents.
 * Supports file picker and drag-drop with upload progress display.
 *
 * @module features/datasets/components/VersionUploadArea
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { UploadCloud, Loader } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

// ============================================================================
// Constants
// ============================================================================

/** @description Accepted file extensions for document upload */
const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv'

// ============================================================================
// Types
// ============================================================================

interface VersionUploadAreaProps {
  /** @description Whether upload is in progress */
  uploading: boolean
  /** @description Callback when files are selected for upload */
  onUpload: (files: File[]) => void
}

/** @description Per-file upload tracking item */
interface FileUploadItem {
  name: string
  size: number
  status: 'pending' | 'uploading' | 'success' | 'failed'
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format bytes to a human-readable string.
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
 * Drag-and-drop file upload area with progress tracking.
 *
 * @param {VersionUploadAreaProps} props - Component props
 * @returns {JSX.Element} The rendered upload area
 */
const VersionUploadArea = ({ uploading, onUpload }: VersionUploadAreaProps) => {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<FileUploadItem[]>([])

  /** Filter files by accepted extensions */
  const filterFiles = (fileList: FileList | File[]): File[] => {
    const acceptedExts = ACCEPTED_EXTENSIONS.split(',')
    return Array.from(fileList).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase()
      return acceptedExts.includes(ext)
    })
  }

  /** Handle file selection from input */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const filtered = filterFiles(files)
    if (filtered.length > 0) {
      // Show selected files
      setSelectedFiles(filtered.map((f) => ({ name: f.name, size: f.size, status: 'pending' as const })))
      onUpload(filtered)
    }
    // Reset input
    e.target.value = ''
  }

  /** Handle drag-and-drop */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    const filtered = filterFiles(files)
    if (filtered.length > 0) {
      setSelectedFiles(filtered.map((f) => ({ name: f.name, size: f.size, status: 'pending' as const })))
      onUpload(filtered)
    }
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          flex items-center gap-3 px-4 py-6 rounded-lg border-2 border-dashed cursor-pointer
          transition-colors
          ${dragOver
            ? 'border-primary bg-primary/5 dark:bg-primary/10'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50 dark:border-slate-600 dark:hover:border-slate-500'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <UploadCloud size={24} className="text-muted-foreground shrink-0" />
        <div className="text-left">
          <p className="text-sm text-muted-foreground">
            {t('versions.uploadHint')}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {t('versions.acceptedTypes')}
          </p>
        </div>
      </div>

      {/* Upload progress list */}
      {selectedFiles.length > 0 && uploading && (
        <div className="bg-muted/50 rounded-lg p-3 border space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t('versions.uploading')}</span>
            <Progress value={50} className="w-24 h-1.5" />
          </div>
          <div className="space-y-1 max-h-[160px] overflow-auto">
            {selectedFiles.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {uploading && <Loader size={12} className="text-primary animate-spin shrink-0" />}
                  <span className="truncate text-foreground">{item.name}</span>
                </div>
                <span className="text-muted-foreground shrink-0">{formatFileSize(item.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS}
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  )
}

export default VersionUploadArea
