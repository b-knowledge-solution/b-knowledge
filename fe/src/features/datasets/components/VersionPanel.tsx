/**
 * @fileoverview Version management panel for a dataset.
 * Displays version chips, selected version's file list, and upload area.
 * Orchestrates version CRUD, file operations, and converter integration.
 *
 * @module features/datasets/components/VersionPanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Archive, Trash2, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useVersions, useVersionFiles } from '../api/datasetQueries'
import VersionModal from './VersionModal'
import VersionFileTable from './VersionFileTable'
import VersionUploadArea from './VersionUploadArea'
import ConverterJobsModal from './ConverterJobsModal'
import type { DocumentVersion } from '../types'

// ============================================================================
// Types
// ============================================================================

interface VersionPanelProps {
  /** @description Dataset ID */
  datasetId: string
  /** @description Whether the user has admin permissions */
  isAdmin: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * Version management panel showing version chips, file table, and upload area.
 *
 * @param {VersionPanelProps} props - Component props
 * @returns {JSX.Element} The rendered version panel
 */
const VersionPanel = ({ datasetId, isAdmin }: VersionPanelProps) => {
  const { t } = useTranslation()

  // Version state
  const {
    versions,
    loading: loadingVersions,
    selectedVersion,
    selectVersion,
    createVersion,
    updateVersion,
    archiveVersion,
    deleteVersion,
  } = useVersions(datasetId)

  // File state for the selected version
  const {
    files,
    loading: loadingFiles,
    uploading,
    uploadFiles,
    deleteFiles,
    convertFiles,
    parseFiles,
    syncStatus,
    requeueFiles,
    refresh: refreshFiles,
    jobs,
    loadingJobs,
    refreshJobs,
  } = useVersionFiles(datasetId, selectedVersion?.id)

  // Modal state
  const [versionModalOpen, setVersionModalOpen] = useState(false)
  const [editingVersion, setEditingVersion] = useState<DocumentVersion | null>(null)
  const [saving, setSaving] = useState(false)
  const [jobsModalOpen, setJobsModalOpen] = useState(false)

  /** Open create version modal */
  const handleOpenCreate = () => {
    setEditingVersion(null)
    setVersionModalOpen(true)
  }

  /** Open edit version modal */
  const handleOpenEdit = (version: DocumentVersion) => {
    setEditingVersion(version)
    setVersionModalOpen(true)
  }

  /** Submit version create/edit */
  const handleSubmitVersion = async (data: { version_label: string }) => {
    setSaving(true)
    try {
      if (editingVersion) {
        await updateVersion(editingVersion.id, data)
      } else {
        await createVersion(data)
      }
      setVersionModalOpen(false)
      setEditingVersion(null)
    } catch {
      // Error handled in hook
    } finally {
      setSaving(false)
    }
  }

  /** Status color for version chips */
  const statusColor = (status: string) =>
    status === 'active'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'

  // Active job count for badge
  const activeJobCount = jobs.filter(
    (j) => j.status === 'pending' || j.status === 'converting',
  ).length

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t('versions.title')}</CardTitle>
          <div className="flex items-center gap-2">
            {/* Converter jobs button */}
            {selectedVersion && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { refreshJobs(); setJobsModalOpen(true) }}
                      className="relative"
                    >
                      <Layers size={14} className="mr-1" />
                      {t('versions.converterJobs')}
                      {activeJobCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
                        >
                          {activeJobCount}
                        </Badge>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('versions.viewJobs')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Create version button */}
            {isAdmin && (
              <Button size="sm" onClick={handleOpenCreate}>
                <Plus size={14} className="mr-1" />
                {t('versions.add')}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Version chips */}
        {loadingVersions ? (
          <div className="flex gap-2">
            {[1, 2, 3].map((k) => (
              <div key={k} className="h-12 w-36 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t('versions.empty')}
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {versions.map((ver) => (
              <div
                key={ver.id}
                onClick={() => selectVersion(ver)}
                className={`
                  group relative flex flex-col gap-1 px-4 py-2.5 rounded-lg cursor-pointer border transition-all text-sm min-w-[140px]
                  ${selectedVersion?.id === ver.id
                    ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                    : 'border-border hover:border-muted-foreground/40 bg-card'
                  }
                `}
              >
                {/* Version label + status */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{ver.version_label}</span>
                  <Badge variant="secondary" className={`text-[10px] px-1.5 ${statusColor(ver.status)}`}>
                    {t(`versions.status.${ver.status}`)}
                  </Badge>
                </div>

                {/* Action buttons — visible on hover */}
                {isAdmin && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(ver) }}
                          >
                            <Pencil size={12} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('common.edit')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {ver.status !== 'archived' && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); archiveVersion(ver.id) }}
                            >
                              <Archive size={12} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{t('versions.archive')}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteVersion(ver.id) }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t('common.delete')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Selected version content */}
        {selectedVersion && (
          <div className="space-y-4 pt-2 border-t">
            {/* Upload area (admin only) */}
            {isAdmin && (
              <VersionUploadArea
                uploading={uploading}
                onUpload={(fileList) => uploadFiles(fileList).then(refreshFiles)}
              />
            )}

            {/* File table */}
            <VersionFileTable
              files={files}
              loading={loadingFiles}
              isAdmin={isAdmin}
              onDelete={deleteFiles}
              onConvert={convertFiles}
              onParse={parseFiles}
              onSyncStatus={syncStatus}
              onRequeue={requeueFiles}
            />
          </div>
        )}
      </CardContent>

      {/* Version create/edit modal */}
      <VersionModal
        open={versionModalOpen}
        editingVersion={editingVersion}
        saving={saving}
        onSubmit={handleSubmitVersion}
        onCancel={() => { setVersionModalOpen(false); setEditingVersion(null) }}
      />

      {/* Converter jobs modal */}
      <ConverterJobsModal
        open={jobsModalOpen}
        onClose={() => setJobsModalOpen(false)}
        jobs={jobs}
        loading={loadingJobs}
        onRefresh={refreshJobs}
      />
    </Card>
  )
}

export default VersionPanel
