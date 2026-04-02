
/**
 * @fileoverview Chat file attachment preview strip.
 * Shows thumbnails for images and icons for PDFs above the chat input.
 * Each file has a remove button.
 *
 * @module features/chat/components/ChatFileUpload
 */

import { useTranslation } from 'react-i18next'
import { X, FileText, Loader2 } from 'lucide-react'
import type { UploadedFile } from '../hooks/useChatFiles'

// ============================================================================
// Props
// ============================================================================

interface ChatFileUploadProps {
  /** List of uploaded files to display */
  files: UploadedFile[]
  /** Whether files are currently being uploaded */
  isUploading: boolean
  /** Upload error message */
  uploadError: string | null
  /** Callback to remove a file by ID */
  onRemove: (fileId: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description File preview strip showing attached files above the chat input.
 * Displays image thumbnails and PDF icons with remove buttons.
 *
 * @param {ChatFileUploadProps} props - Component properties
 * @returns {JSX.Element | null} The rendered file strip or null if empty
 */
function ChatFileUpload({ files, isUploading, uploadError, onRemove }: ChatFileUploadProps) {
  const { t } = useTranslation()

  // Don't render if no files and not uploading
  if (files.length === 0 && !isUploading && !uploadError) return null

  return (
    <div className="px-4 pt-2">
      <div className="max-w-3xl mx-auto">
        {/* Error message */}
        {uploadError && (
          <p className="text-xs text-red-500 dark:text-red-400 mb-1.5">
            {uploadError}
          </p>
        )}

        {/* File preview strip */}
        <div className="flex items-center gap-2 flex-wrap">
          {files.map((file) => (
            <div
              key={file.id}
              className="relative group flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-2 py-1.5 text-xs"
            >
              {/* Thumbnail or icon */}
              {file.previewUrl ? (
                <img
                  src={file.previewUrl}
                  alt={file.originalName}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <FileText className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />
              )}

              {/* Filename */}
              <span className="max-w-[120px] truncate text-slate-700 dark:text-slate-300">
                {file.originalName}
              </span>

              {/* Remove button */}
              <button
                type="button"
                className="ml-0.5 h-4 w-4 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                onClick={() => onRemove(file.id)}
                title={t('chat.removeFile')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {/* Upload loading indicator */}
          {isUploading && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t('chat.uploadingFiles')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatFileUpload
