/**
 * @fileoverview File upload modal supporting both individual files and folder upload.
 *
 * - Drag-and-drop supports files AND folders (uses webkitGetAsEntry for recursive traversal)
 * - Two buttons: "Upload Files" (multi-file picker) and "Upload Folder" (directory picker)
 * - Files from folders display their relative path
 *
 * @module features/datasets/components/FileUploadModal
 */

import React, { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, FolderUp, X, FileText, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

interface FileUploadModalProps {
  open: boolean
  uploading: boolean
  onUpload: (files: File[]) => Promise<void>
  onCancel: () => void
}

const ACCEPTED_EXTENSIONS = [
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
  '.txt', '.md', '.csv', '.json', '.html', '.htm',
  '.jpg', '.jpeg', '.png', '.tiff', '.bmp',
  '.mp3', '.wav', '.ogg',
  '.eml',
]

/** File entry with optional relative path (for folder uploads) */
interface UploadEntry {
  file: File
  relativePath: string
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Recursively traverse a dropped directory entry and collect all files.
 * @param entry - FileSystemEntry from dataTransfer
 * @param basePath - Accumulated relative path
 */
function traverseEntry(entry: FileSystemEntry, basePath: string): Promise<UploadEntry[]> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      ;(entry as FileSystemFileEntry).file((file) => {
        resolve([{ file, relativePath: basePath + file.name }])
      })
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader()
      const allEntries: UploadEntry[] = []

      // readEntries may not return all entries at once — must keep reading until empty
      const readBatch = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(allEntries)
            return
          }
          for (const child of entries) {
            const childEntries = await traverseEntry(child, basePath + entry.name + '/')
            allEntries.push(...childEntries)
          }
          readBatch()
        })
      }
      readBatch()
    } else {
      resolve([])
    }
  })
}

/** Check if a file extension is in the accepted list */
function isAccepted(fileName: string): boolean {
  const ext = '.' + fileName.split('.').pop()?.toLowerCase()
  return ACCEPTED_EXTENSIONS.includes(ext)
}

/** Format byte size to human-readable string */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// ============================================================================
// Component
// ============================================================================

const FileUploadModal: React.FC<FileUploadModalProps> = ({
  open,
  uploading,
  onUpload,
  onCancel,
}) => {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  /** Add files filtering by accepted extensions */
  const addFiles = (newEntries: UploadEntry[]) => {
    const filtered = newEntries.filter((e) => isAccepted(e.file.name))
    setEntries((prev) => [...prev, ...filtered])
  }

  /** Handle drag-and-drop — supports both files and folders */
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const items = e.dataTransfer.items
    if (!items) {
      // Fallback: plain files
      const droppedFiles = Array.from(e.dataTransfer.files)
      addFiles(droppedFiles.map((f) => ({ file: f, relativePath: f.name })))
      return
    }

    // Use webkitGetAsEntry for recursive folder traversal
    const allEntries: UploadEntry[] = []
    const entryPromises: Promise<UploadEntry[]>[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const entry = item?.webkitGetAsEntry?.()
      if (entry) {
        entryPromises.push(traverseEntry(entry, ''))
      }
    }

    const results = await Promise.all(entryPromises)
    for (const batch of results) {
      allEntries.push(...batch)
    }

    addFiles(allEntries)
  }

  /** Handle file input change (multi-file picker) */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files)
      addFiles(selected.map((f) => ({ file: f, relativePath: f.name })))
    }
    e.target.value = ''
  }

  /** Handle folder input change (directory picker) */
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files)
      addFiles(
        selected.map((f) => ({
          file: f,
          // webkitRelativePath includes the folder name, e.g. "myFolder/sub/file.pdf"
          relativePath: (f as any).webkitRelativePath || f.name,
        })),
      )
    }
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (entries.length === 0) return
    await onUpload(entries.map((e) => e.file))
    setEntries([])
  }

  const handleClose = () => {
    setEntries([])
    onCancel()
  }

  // Count how many files came from folders (have a "/" in their relative path)
  const folderFileCount = entries.filter((e) => e.relativePath.includes('/')).length

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !v && handleClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('datasets.uploadTitle')}</DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload
            size={40}
            className="mx-auto mb-3 text-slate-400 dark:text-slate-500"
          />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {t('datasets.dropFiles')}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Drop files or folders here, or use buttons below
          </p>
        </div>

        {/* Upload buttons: File + Folder */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} className="mr-1.5" />
            {t('datasets.uploadFiles')}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => folderInputRef.current?.click()}
          >
            <FolderUp size={16} className="mr-1.5" />
            Upload Folder
          </Button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Hidden folder input */}
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error -- webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={handleFolderSelect}
          />
        </div>

        {/* File list */}
        {entries.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              {entries.length} file{entries.length !== 1 ? 's' : ''} selected
              {folderFileCount > 0 && ` (${folderFileCount} from folders)`}
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {entries.map((entry, index) => (
                <div
                  key={`${entry.relativePath}-${index}`}
                  className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800"
                >
                  {entry.relativePath.includes('/') ? (
                    <Folder size={16} className="text-blue-400 flex-shrink-0" />
                  ) : (
                    <FileText size={16} className="text-slate-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-300 truncate">
                      {entry.relativePath}
                    </p>
                    <p className="text-xs text-slate-400">{formatSize(entry.file.size)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(index)
                    }}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
          <Button
            disabled={entries.length === 0 || uploading}
            onClick={handleUpload}
          >
            {uploading ? '...' : t('datasets.uploadButton', { count: entries.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default FileUploadModal
