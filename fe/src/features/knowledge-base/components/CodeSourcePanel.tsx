/**
 * @fileoverview Code source import panel with Git Clone and ZIP Upload tabs.
 * IDE-aesthetic panel with dark background, monospace URL inputs, and green accent buttons.
 * @module features/knowledge-base/components/CodeSourcePanel
 */

import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GitBranch, Archive, FolderGit2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { globalMessage } from '@/lib/globalMessage'
import { importGitRepo, importZipFile } from '../api/knowledgeBaseApi'
import { FileSize } from '@/constants'

// ============================================================================
// Types
// ============================================================================

/**
 * @description Props for the CodeSourcePanel component
 */
interface CodeSourcePanelProps {
  /** Knowledge Base UUID */
  knowledgeBaseId: string
  /** Category UUID */
  categoryId: string
  /** Dataset UUID (for display/context) */
  datasetId: string
  /** Callback invoked after a successful import */
  onImportComplete: () => void
}

/** Active tab discriminator */
type SourceTab = 'git' | 'zip'

// ============================================================================
// Component
// ============================================================================

/**
 * @description Import source panel with two tabs: Git Clone and ZIP Upload.
 *   Git Clone accepts repo URL, branch, and subdirectory path.
 *   ZIP Upload accepts drag-and-drop .zip files up to 100MB.
 *   Both trigger the backend import pipeline and show loading/success/error states.
 * @param {CodeSourcePanelProps} props - Panel configuration
 * @returns {JSX.Element} Rendered import source panel
 */
export default function CodeSourcePanel({ knowledgeBaseId, categoryId, datasetId: _datasetId, onImportComplete }: CodeSourcePanelProps) {
  const { t } = useTranslation()

  // Active tab state
  const [activeTab, setActiveTab] = useState<SourceTab>('git')
  // Loading state for import operations
  const [importing, setImporting] = useState(false)

  // Git form state
  const [gitUrl, setGitUrl] = useState('')
  const [gitBranch, setGitBranch] = useState('main')
  const [gitPath, setGitPath] = useState('/')

  // ZIP file state
  const [zipFile, setZipFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * @description Handle Git clone form submission
   */
  const handleGitImport = async () => {
    // Guard: require a URL before submitting
    if (!gitUrl.trim()) return

    try {
      setImporting(true)
      const result = await importGitRepo(knowledgeBaseId, categoryId, {
        url: gitUrl.trim(),
        branch: gitBranch.trim() || 'main',
        path: gitPath.trim() || '/',
      })
      globalMessage.success(t('knowledgeBase.codeSourceImportSuccess', { count: result.fileCount }))
      // Reset form after successful import
      setGitUrl('')
      setGitBranch('main')
      setGitPath('/')
      onImportComplete()
    } catch (err) {
      globalMessage.error(t('knowledgeBase.codeSourceImportError') + ': ' + String(err))
    } finally {
      setImporting(false)
    }
  }

  /**
   * @description Handle ZIP file upload submission
   */
  const handleZipImport = async () => {
    // Guard: require a file before submitting
    if (!zipFile) return

    try {
      setImporting(true)
      const result = await importZipFile(knowledgeBaseId, categoryId, zipFile)
      globalMessage.success(t('knowledgeBase.codeSourceImportSuccess', { count: result.fileCount }))
      // Reset file state after successful import
      setZipFile(null)
      onImportComplete()
    } catch (err) {
      globalMessage.error(t('knowledgeBase.codeSourceImportError') + ': ' + String(err))
    } finally {
      setImporting(false)
    }
  }

  /**
   * @description Handle file drop on the ZIP dropzone
   * @param {React.DragEvent} e - Drag event with files
   */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    // Only accept .zip files under 100MB
    // Only accept .zip files under the max ZIP file size limit
    if (file && file.name.endsWith('.zip') && file.size <= FileSize.MAX_ZIP_FILE) {
      setZipFile(file)
    }
  }

  /**
   * @description Handle file input change for ZIP upload
   * @param {React.ChangeEvent<HTMLInputElement>} e - File input change event
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setZipFile(file)
    }
  }

  return (
    <div className="bg-slate-950 dark:bg-slate-950 border-b border-slate-800 px-4 py-3">
      {/* Panel header with title and tab switcher */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {t('knowledgeBase.codeSourceTitle')}
        </h4>

        {/* Pill-style tab switcher */}
        <div className="flex gap-1 bg-slate-900 rounded-md p-0.5">
          <button
            onClick={() => setActiveTab('git')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'git'
                ? 'bg-slate-700 text-slate-200'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <GitBranch className="h-3 w-3" />
            {t('knowledgeBase.codeSourceGitTab')}
          </button>
          <button
            onClick={() => setActiveTab('zip')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === 'zip'
                ? 'bg-slate-700 text-slate-200'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Archive className="h-3 w-3" />
            {t('knowledgeBase.codeSourceZipTab')}
          </button>
        </div>
      </div>

      {/* Git Clone tab content */}
      {activeTab === 'git' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-2">
            {t('knowledgeBase.codeSourceGitDescription')}
          </p>

          {/* Repository URL input */}
          <div>
            <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">
              {t('knowledgeBase.codeSourceGitUrl')}
            </label>
            <Input
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder={t('knowledgeBase.codeSourceGitUrlPlaceholder')}
              className="font-mono text-xs bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500"
              disabled={importing}
            />
          </div>

          {/* Branch and path inputs in a row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">
                <GitBranch className="h-3 w-3 inline mr-1" />
                {t('knowledgeBase.codeSourceGitBranch')}
              </label>
              <Input
                value={gitBranch}
                onChange={(e) => setGitBranch(e.target.value)}
                placeholder={t('knowledgeBase.codeSourceGitBranchPlaceholder')}
                className="font-mono text-xs bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500"
                disabled={importing}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 uppercase tracking-wide block mb-1">
                <FolderGit2 className="h-3 w-3 inline mr-1" />
                {t('knowledgeBase.codeSourceGitPath')}
              </label>
              <Input
                value={gitPath}
                onChange={(e) => setGitPath(e.target.value)}
                placeholder={t('knowledgeBase.codeSourceGitPathPlaceholder')}
                className="font-mono text-xs bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-600 focus-visible:ring-emerald-500"
                disabled={importing}
              />
            </div>
          </div>

          {/* Clone button */}
          <Button
            onClick={handleGitImport}
            disabled={importing || !gitUrl.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs w-full mt-1"
            size="sm"
          >
            {importing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                {t('knowledgeBase.codeSourceImporting')}
              </>
            ) : (
              <>
                <GitBranch className="h-3.5 w-3.5 mr-1.5" />
                {t('knowledgeBase.codeSourceGitClone')}
              </>
            )}
          </Button>
        </div>
      )}

      {/* ZIP Upload tab content */}
      {activeTab === 'zip' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 mb-2">
            {t('knowledgeBase.codeSourceZipDescription')}
          </p>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-slate-500 rounded-md p-4 text-center cursor-pointer transition-colors"
          >
            <Archive className="h-6 w-6 mx-auto text-slate-600 mb-1" />
            {/* Show selected file name or drop prompt */}
            {zipFile ? (
              <p className="text-xs text-slate-300 font-mono">{zipFile.name}</p>
            ) : (
              <>
                <p className="text-xs text-slate-400">{t('knowledgeBase.codeSourceZipDrop')}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{t('knowledgeBase.codeSourceZipAccept')}</p>
              </>
            )}
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Upload button */}
          <Button
            onClick={handleZipImport}
            disabled={importing || !zipFile}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs w-full mt-1"
            size="sm"
          >
            {importing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                {t('knowledgeBase.codeSourceImporting')}
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                {t('knowledgeBase.codeSourceZipUpload')}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
