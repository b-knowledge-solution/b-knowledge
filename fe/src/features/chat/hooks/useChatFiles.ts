
/**
 * @fileoverview Hook for managing chat file uploads.
 * Handles file selection, upload to backend, preview URLs, and state management.
 *
 * @module features/chat/hooks/useChatFiles
 */

import { useState, useRef } from 'react'
import { chatApi } from '../api/chatApi'
import { FileSize, UploadLimit } from '@/constants'

// ============================================================================
// Types
// ============================================================================

/** Represents an uploaded file with metadata and optional preview */
export interface UploadedFile {
  /** Server-assigned file ID */
  id: string
  /** Original filename */
  originalName: string
  /** MIME type */
  mimeType: string
  /** File size in bytes */
  size: number
  /** Local preview URL for images (blob URL) */
  previewUrl?: string | undefined
}

/** Return type for the useChatFiles hook */
export interface UseChatFilesReturn {
  /** Currently uploaded files */
  files: UploadedFile[]
  /** Whether files are being uploaded */
  isUploading: boolean
  /** Upload error message if any */
  uploadError: string | null
  /** Upload files to the server */
  uploadFiles: (fileList: FileList) => Promise<void>
  /** Remove a file by ID */
  removeFile: (fileId: string) => void
  /** Clear all files */
  clearFiles: () => void
  /** Get array of file IDs for sending with messages */
  fileIds: string[]
}

// ============================================================================
// Constants
// ============================================================================

/** Allowed MIME types for chat uploads */
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
])

/** Maximum file size in bytes (20MB) */
const MAX_FILE_SIZE = FileSize.MAX_CHAT_FILE

/** Maximum number of files per upload */
const MAX_FILES = UploadLimit.MAX_CHAT_FILES

// ============================================================================
// Hook
// ============================================================================

/**
 * @description Hook to manage chat file uploads with local preview and server sync.
 * @param conversationId - The active conversation ID for uploads
 * @returns File state and control functions
 */
export function useChatFiles(conversationId: string | null): UseChatFilesReturn {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Track blob URLs for cleanup
  const blobUrlsRef = useRef<string[]>([])

  /**
   * @description Upload files to the backend after local type and size validation.
   * @param fileList - FileList from file input or drop event
   */
  const uploadFiles = async (fileList: FileList) => {
    if (!conversationId) return

    setUploadError(null)

    // Convert to array and enforce limit
    const fileArray = Array.from(fileList).slice(0, MAX_FILES - files.length)
    if (fileArray.length === 0) return

    // Client-side validation
    for (const file of fileArray) {
      if (!ALLOWED_TYPES.has(file.type)) {
        setUploadError(`File type "${file.type}" is not allowed`)
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`File "${file.name}" exceeds 20MB limit`)
        return
      }
    }

    setIsUploading(true)

    try {
      // Build FormData
      const formData = new FormData()
      for (const file of fileArray) {
        formData.append('files', file)
      }

      // Upload to server
      const uploaded = await chatApi.uploadChatFiles(conversationId, formData)

      // Create local preview URLs for images
      const newFiles: UploadedFile[] = uploaded.map((serverFile, index) => {
        let previewUrl: string | undefined
        const localFile = fileArray[index]

        if (localFile && localFile.type.startsWith('image/')) {
          previewUrl = URL.createObjectURL(localFile)
          blobUrlsRef.current.push(previewUrl)
        }

        return {
          id: serverFile.id,
          originalName: serverFile.original_name,
          mimeType: serverFile.mime_type,
          size: serverFile.size,
          previewUrl,
        }
      })

      setFiles((prev) => [...prev, ...newFiles])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(msg)
    } finally {
      setIsUploading(false)
    }
  }

  /**
   * @description Remove a file by ID and revoke its blob URL to prevent memory leaks.
   * @param fileId - The file ID to remove
   */
  const removeFile = (fileId: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === fileId)
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl)
      }
      return prev.filter((f) => f.id !== fileId)
    })
  }

  /**
   * @description Clear all files and revoke all blob URLs to prevent memory leaks.
   */
  const clearFiles = () => {
    // Revoke all blob URLs to prevent memory leaks
    for (const url of blobUrlsRef.current) {
      URL.revokeObjectURL(url)
    }
    blobUrlsRef.current = []
    setFiles([])
    setUploadError(null)
  }

  return {
    files,
    isUploading,
    uploadError,
    uploadFiles,
    removeFile,
    clearFiles,
    fileIds: files.map((f) => f.id),
  }
}
